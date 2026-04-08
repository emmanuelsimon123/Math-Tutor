/**
 * AI Math Tutor — Cloudflare Worker
 *
 * Endpoints:
 *   POST /auth   — Validates the class password.
 *   POST /solve  — Socratic tutoring via Groq API (streaming or JSON).
 *
 * Required environment variables (set as Cloudflare secrets):
 *   STUDENT_PASSWORD  — The class password students use to log in.
 *   GROQ_API_KEY      — Your Groq API key (https://console.groq.com).
 *   ALLOWED_ORIGIN    — Your GitHub Pages URL, e.g. https://username.github.io
 *                       (used for origin-locked CORS).
 */

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Simple in-memory map: IP → { count, windowStart }
// Resets every RATE_WINDOW_MS milliseconds.
const rateLimitMap = new Map();
const RATE_LIMIT = 30;          // max requests per window
const RATE_WINDOW_MS = 60_000;  // 1 minute

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ─── Groq API ─────────────────────────────────────────────────────────────────
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Model for text-only requests.
const TEXT_MODEL = "llama-3.1-8b-instant";

// Model for vision/image requests.
// See https://console.groq.com/docs/vision for the currently supported vision
// models.  As of early 2025, "llama-3.2-90b-vision-preview" is supported.
// If this model is deprecated, update it to the latest vision-capable model.
const VISION_MODEL = "llama-3.2-90b-vision-preview";

// ─── Socratic system prompt ───────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a Socratic math tutor for middle and high school students. \
Your role is to guide students to discover answers themselves through questions and hints — \
never simply give away the final answer.

Guidelines:
- Ask guiding questions to help students think through the problem step by step.
- Break problems into small, manageable steps.
- Acknowledge correct thinking and gently redirect misconceptions.
- Use encouraging, patient language appropriate for the student's level.
- When appropriate, render mathematical expressions using LaTeX delimiters \
(e.g. $x^2 + 3x - 4 = 0$ or \\[\\frac{a}{b}\\]).
- For graphing requests, output a graph tag on its own line in this exact format:
    [GRAPH: expression]
  Example: [GRAPH: x^2 - 4]
- For parameterized / transformation graphs, include slider parameters:
    [GRAPH: a*x^2 + b*x + c | a=1:-5:5 | b=0:-5:5 | c=0:-10:10]
  Each parameter follows the pattern  name=default:min:max
- Keep responses concise and age-appropriate.
- If a student uploads an image of a math problem, describe what you see, \
  then guide them Socratically just as you would for a typed question.`;

// ─── Input validation constants ───────────────────────────────────────────────
const MAX_MESSAGE_LENGTH = 4000;  // characters per message
const MAX_MESSAGES = 20;          // conversation history cap

// ─── Main fetch handler ───────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = env.ALLOWED_ORIGIN || "";

    // CORS preflight
    if (request.method === "OPTIONS") {
      return corsResponse(null, 204, allowedOrigin);
    }

    // Origin check (skip when ALLOWED_ORIGIN is not configured, e.g. local dev)
    if (allowedOrigin && origin !== allowedOrigin) {
      return corsResponse({ error: "Forbidden" }, 403, allowedOrigin);
    }

    // Rate limiting
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (!checkRateLimit(ip)) {
      return corsResponse(
        { error: "Too many requests. Please wait a minute before trying again." },
        429,
        allowedOrigin
      );
    }

    if (url.pathname === "/auth" && request.method === "POST") {
      return handleAuth(request, env, allowedOrigin);
    }

    if (url.pathname === "/solve" && request.method === "POST") {
      return handleSolve(request, env, allowedOrigin);
    }

    return corsResponse({ error: "Not found" }, 404, allowedOrigin);
  }
};

// ─── CORS helper ─────────────────────────────────────────────────────────────
function corsResponse(body, status, allowedOrigin) {
  const headers = {
    "Access-Control-Allow-Origin": allowedOrigin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };
  if (body === null) {
    return new Response(null, { status, headers });
  }
  return new Response(JSON.stringify(body), { status, headers });
}

// ─── /auth ────────────────────────────────────────────────────────────────────
async function handleAuth(request, env, allowedOrigin) {
  let body;
  try {
    body = await request.json();
  } catch {
    return corsResponse({ error: "Invalid JSON" }, 400, allowedOrigin);
  }

  const { password } = body;
  if (!password || typeof password !== "string") {
    return corsResponse({ error: "Password required" }, 400, allowedOrigin);
  }

  if (password !== env.STUDENT_PASSWORD) {
    return corsResponse({ error: "Incorrect password" }, 401, allowedOrigin);
  }

  return corsResponse({ ok: true }, 200, allowedOrigin);
}

// ─── /solve ───────────────────────────────────────────────────────────────────
async function handleSolve(request, env, allowedOrigin) {
  let body;
  try {
    body = await request.json();
  } catch {
    return corsResponse({ error: "Invalid JSON" }, 400, allowedOrigin);
  }

  const { password, messages, stream = false } = body;

  // Validate password
  if (!password || password !== env.STUDENT_PASSWORD) {
    return corsResponse({ error: "Unauthorized" }, 401, allowedOrigin);
  }

  // Validate messages array
  if (!Array.isArray(messages) || messages.length === 0) {
    return corsResponse({ error: "Messages array required" }, 400, allowedOrigin);
  }

  if (messages.length > MAX_MESSAGES) {
    return corsResponse(
      { error: `Too many messages (max ${MAX_MESSAGES})` },
      400,
      allowedOrigin
    );
  }

  // Sanitize and validate messages
  const sanitizedMessages = [];
  let hasImage = false;

  for (const msg of messages) {
    if (!msg.role || !msg.content) continue;
    if (!["user", "assistant"].includes(msg.role)) continue;

    if (typeof msg.content === "string") {
      if (msg.content.length > MAX_MESSAGE_LENGTH) {
        return corsResponse(
          { error: "Message too long (max 4,000 characters)" },
          400,
          allowedOrigin
        );
      }
      sanitizedMessages.push({ role: msg.role, content: msg.content });

    } else if (Array.isArray(msg.content)) {
      // Vision / multimodal message
      const sanitizedParts = [];
      for (const part of msg.content) {
        if (part.type === "text") {
          if (typeof part.text === "string" && part.text.length <= MAX_MESSAGE_LENGTH) {
            sanitizedParts.push({ type: "text", text: part.text });
          }
        } else if (part.type === "image_url" && msg.role === "user") {
          // Only accept base64 data URLs — reject arbitrary remote URLs
          if (
            part.image_url &&
            typeof part.image_url.url === "string" &&
            part.image_url.url.startsWith("data:image/")
          ) {
            sanitizedParts.push({
              type: "image_url",
              image_url: { url: part.image_url.url }
            });
            hasImage = true;
          }
        }
      }
      if (sanitizedParts.length > 0) {
        sanitizedMessages.push({ role: msg.role, content: sanitizedParts });
      }
    }
  }

  if (sanitizedMessages.length === 0) {
    return corsResponse({ error: "No valid messages provided" }, 400, allowedOrigin);
  }

  const model = hasImage ? VISION_MODEL : TEXT_MODEL;

  const groqPayload = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...sanitizedMessages
    ],
    stream
  };

  try {
    const groqResponse = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(groqPayload)
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error("Groq API error:", errorText);
      return corsResponse(
        { error: "AI service unavailable. Please try again." },
        502,
        allowedOrigin
      );
    }

    if (stream) {
      // Forward the SSE stream directly from Groq to the client.
      // Groq uses the standard OpenAI streaming format:
      //   data: {"choices":[{"delta":{"content":"token"},...}],...}
      //   data: [DONE]
      return new Response(groqResponse.body, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": allowedOrigin || "*"
        }
      });
    }

    // Non-streaming: extract the answer and return as JSON
    const groqData = await groqResponse.json();
    const answer =
      groqData.choices?.[0]?.message?.content ||
      "I'm sorry, I couldn't generate a response.";
    return corsResponse({ answer }, 200, allowedOrigin);

  } catch (error) {
    console.error("Worker error:", error);
    return corsResponse(
      { error: "Internal server error. Please try again." },
      500,
      allowedOrigin
    );
  }
}
