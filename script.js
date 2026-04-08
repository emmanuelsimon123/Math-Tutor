// ============================================================
// CONFIG
// Change WORKER_BASE_URL to match your Cloudflare Worker deployment URL.
// See worker/README.md for setup instructions.
// ============================================================
const WORKER_BASE_URL = "https://ai-math-tutor-worker.emmanuel-simon.workers.dev";
const WORKER_URL = WORKER_BASE_URL + "/solve";
const AUTH_URL   = WORKER_BASE_URL + "/auth";

// ============================================================
// DOM REFERENCES
// ============================================================
const loginOverlay          = document.getElementById("login-overlay");
const loginForm             = document.getElementById("login-form");
const loginPassword         = document.getElementById("login-password");
const loginError            = document.getElementById("login-error");
const appContainer          = document.getElementById("app-container");
const loadingOverlay        = document.getElementById("loading-overlay");
const darkToggleBtn         = document.getElementById("dark-toggle");
const chat                  = document.getElementById("chat");
const form                  = document.getElementById("chat-form");
const userInput             = document.getElementById("user-input");
const sendButton            = document.getElementById("send-button");
const clearButton           = document.getElementById("clear-button");
const downloadButton        = document.getElementById("download-button");
const statusDiv             = document.getElementById("status");
const fileInput             = document.getElementById("image-file-input");
const uploadButton          = document.getElementById("image-upload-btn");
const imagePreviewContainer = document.getElementById("image-preview-container");
const imagePreviewImg       = document.getElementById("image-preview");
const removeImageButton     = document.getElementById("remove-image-btn");

// ============================================================
// DARK MODE
// ============================================================
function applyDarkMode(dark) {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  localStorage.setItem("mathTutorTheme", dark ? "dark" : "light");
  darkToggleBtn.textContent = dark ? "\u2600\uFE0F" : "\uD83C\uDF19";
  darkToggleBtn.title = dark ? "Switch to light mode" : "Switch to dark mode";
  darkToggleBtn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
}

// Initialise theme: prefer saved setting, otherwise follow system preference.
(function initTheme() {
  const saved = localStorage.getItem("mathTutorTheme");
  if (saved) {
    applyDarkMode(saved === "dark");
  } else {
    applyDarkMode(window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
})();

darkToggleBtn.addEventListener("click", () => {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  applyDarkMode(!isDark);
});

// ============================================================
// AUTH / LOGIN
// ============================================================
let storedPassword = sessionStorage.getItem("mathTutorPassword") || "";

async function attemptLogin(password) {
  try {
    const response = await fetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    if (response.ok) {
      storedPassword = password;
      sessionStorage.setItem("mathTutorPassword", password);
      loginOverlay.style.display = "none";
      if (loadingOverlay) loadingOverlay.style.display = "none";
      appContainer.style.display = "";
      restoreChatHistory();
      userInput.focus();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const pw = loginPassword.value.trim();
  if (!pw) return;
  loginError.textContent = "";
  const success = await attemptLogin(pw);
  if (!success) {
    loginError.textContent = "Incorrect password. Please try again.";
    loginPassword.value = "";
    loginPassword.focus();
  }
});

// Auto-login if a password was saved in this browser session.
// Show a loading overlay instead of a blank page.
if (storedPassword) {
  if (loadingOverlay) loadingOverlay.style.display = "flex";
  loginOverlay.style.display = "none";
  attemptLogin(storedPassword).then(success => {
    if (!success) {
      sessionStorage.removeItem("mathTutorPassword");
      storedPassword = "";
      if (loadingOverlay) loadingOverlay.style.display = "none";
      loginOverlay.style.display = "flex";
    }
  });
}

// ============================================================
// CHAT HISTORY PERSISTENCE
// ============================================================
const MAX_HISTORY = 20;
let messages = [];

function saveChatHistory() {
  try {
    sessionStorage.setItem("mathTutorMessages", JSON.stringify(messages));
  } catch {
    // Storage quota exceeded — silently continue.
  }
}

function restoreChatHistory() {
  try {
    const stored = sessionStorage.getItem("mathTutorMessages");
    if (!stored) return;
    const saved = JSON.parse(stored);
    if (!Array.isArray(saved) || saved.length === 0) return;
    messages = saved;
    // Clear the default welcome message and re-render saved conversation.
    while (chat.firstChild) chat.removeChild(chat.firstChild);
    messages.forEach(msg => renderMessageBubble(msg.role, msg.content));
  } catch {
    // Corrupted storage — start fresh.
  }
}

// ============================================================
// KATEX
// ============================================================
const KATEX_DELIMITERS = [
  { left: "$$", right: "$$",   display: true  },
  { left: "$",  right: "$",    display: false },
  { left: "\\[", right: "\\]", display: true  },
  { left: "\\(", right: "\\)", display: false }
];

function applyKatex(el) {
  if (typeof renderMathInElement === "function") {
    renderMathInElement(el, { delimiters: KATEX_DELIMITERS, throwOnError: false });
  }
}

// ============================================================
// GRAPH UTILITIES
// ============================================================
let graphCounter = 0;

// Allowlist of safe characters for graph expressions.
// This prevents passing arbitrary code to functionPlot's eval-like parser.
const SAFE_EXPRESSION_RE = /^[a-zA-Z0-9+\-*/^()._,\s]*$/;

function isSafeExpression(expr) {
  return SAFE_EXPRESSION_RE.test(expr);
}

/**
 * Returns a Promise that resolves when the functionPlot library is available.
 * Polls every 50 ms, up to maxWait ms.
 */
function waitForFunctionPlot(maxWait = 5000) {
  return new Promise((resolve, reject) => {
    if (typeof functionPlot === "function") { resolve(); return; }
    const start = Date.now();
    const interval = setInterval(() => {
      if (typeof functionPlot === "function") {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > maxWait) {
        clearInterval(interval);
        reject(new Error("Function Plot library failed to load"));
      }
    }, 50);
  });
}

// ============================================================
// SAFE MARKDOWN RENDERING
// Converts **bold**, *italic*, `code`, and \n newlines to DOM nodes.
// No innerHTML is used, making it XSS-safe.
// ============================================================
function parseInlineFormatting(text, container) {
  const inlineRegex = /\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`/g;
  let lastIndex = 0;
  let match;
  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    if (match[1] !== undefined) {
      const strong = document.createElement("strong");
      strong.textContent = match[1];
      container.appendChild(strong);
    } else if (match[2] !== undefined) {
      const em = document.createElement("em");
      em.textContent = match[2];
      container.appendChild(em);
    } else if (match[3] !== undefined) {
      const code = document.createElement("code");
      code.textContent = match[3];
      container.appendChild(code);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    container.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

function renderFormattedText(text, container) {
  const lines = text.split("\n");
  lines.forEach((line, idx) => {
    if (idx > 0) container.appendChild(document.createElement("br"));
    parseInlineFormatting(line, container);
  });
}

// ============================================================
// MESSAGE RENDERING
// ============================================================

/**
 * Appends a chat bubble to the chat section and returns the bubble element.
 * Handles user messages (plain text + optional image) and assistant messages
 * (safe markdown, KaTeX, interactive graphs).
 */
function renderMessageBubble(role, content) {
  const messageEl = document.createElement("div");
  messageEl.className = "message " + role;

  const bubbleEl = document.createElement("div");
  bubbleEl.className = "message-bubble";

  if (role === "assistant") {
    const textContent = (typeof content === "string") ? content : "";
    renderAssistantContent(bubbleEl, textContent);
  } else {
    // User message: content may be a plain string or an array (text + image).
    if (Array.isArray(content)) {
      content.forEach(part => {
        if (part.type === "image_url" && part.image_url && part.image_url.url) {
          const img = document.createElement("img");
          img.src = part.image_url.url;
          img.className = "chat-image";
          img.alt = "Uploaded image";
          bubbleEl.appendChild(img);
        } else if (part.type === "text" && part.text) {
          const textSpan = document.createElement("span");
          textSpan.textContent = part.text;
          bubbleEl.appendChild(textSpan);
        }
      });
    } else {
      bubbleEl.textContent = content;
    }
  }

  messageEl.appendChild(bubbleEl);
  chat.appendChild(messageEl);
  chat.scrollTop = chat.scrollHeight;
  return bubbleEl;
}

/**
 * Renders an assistant response into bubbleEl.
 * Handles [GRAPH: ...] tags, KaTeX, and safe markdown.
 */
function renderAssistantContent(bubbleEl, content) {
  const graphRegex = /\[GRAPH:\s*(.+?)\]/g;
  const graphs = [];
  let match;
  while ((match = graphRegex.exec(content)) !== null) {
    graphs.push({ fullMatch: match[0], raw: match[1].trim(), index: match.index });
  }

  if (graphs.length > 0) {
    bubbleEl.classList.add("has-graph");
    let lastIndex = 0;

    graphs.forEach(graph => {
      // Text segment before this graph tag
      const textBefore = content.slice(lastIndex, graph.index);
      if (textBefore.trim()) {
        const textEl = document.createElement("div");
        renderFormattedText(textBefore, textEl);
        applyKatex(textEl);
        bubbleEl.appendChild(textEl);
      }

      // Parse "expression | param1=default:min:max | ..."
      const parts = graph.raw.split("|").map(s => s.trim());
      const expression = parts[0];

      // Validate expression against allowlist before passing to functionPlot
      if (!isSafeExpression(expression)) {
        const errorEl = document.createElement("div");
        errorEl.className = "graph-error";
        errorEl.textContent = "This graph couldn\u2019t be displayed \u2014 the expression contains unexpected characters.";
        bubbleEl.appendChild(errorEl);
        lastIndex = graph.index + graph.fullMatch.length;
        return;
      }

      const params = [];
      for (let p = 1; p < parts.length; p++) {
        const paramMatch = parts[p].match(/^(\w+)=(-?[\d.]+):(-?[\d.]+):(-?[\d.]+)$/);
        if (paramMatch) {
          params.push({
            name: paramMatch[1],
            default: parseFloat(paramMatch[2]),
            min: parseFloat(paramMatch[3]),
            max: parseFloat(paramMatch[4])
          });
        }
      }

      // Label above the graph
      const labelEl = document.createElement("div");
      labelEl.className = "graph-label";
      labelEl.textContent = "y = " + expression;
      bubbleEl.appendChild(labelEl);

      // Graph container
      const graphId = "graph-" + Date.now() + "-" + (graphCounter++);
      const graphDiv = document.createElement("div");
      graphDiv.className = "graph-container";
      graphDiv.id = graphId;
      graphDiv.dataset.expression = expression;
      graphDiv.dataset.params = JSON.stringify(params);
      bubbleEl.appendChild(graphDiv);

      // Slider controls (only when parameters exist)
      if (params.length > 0) {
        const slidersDiv = document.createElement("div");
        slidersDiv.className = "graph-sliders";
        slidersDiv.dataset.graphId = graphId;

        params.forEach(param => {
          const row = document.createElement("div");
          row.className = "graph-slider-row";

          const label = document.createElement("label");
          label.textContent = param.name;
          row.appendChild(label);

          const slider = document.createElement("input");
          slider.type = "range";
          slider.min = param.min;
          slider.max = param.max;
          slider.step = 0.1;
          slider.value = param.default;
          slider.dataset.paramName = param.name;
          row.appendChild(slider);

          const valueDisplay = document.createElement("span");
          valueDisplay.className = "slider-value";
          valueDisplay.textContent = param.default;
          row.appendChild(valueDisplay);

          slidersDiv.appendChild(row);
        });

        bubbleEl.appendChild(slidersDiv);
      }

      lastIndex = graph.index + graph.fullMatch.length;
    });

    // Text segment after the last graph tag
    const textAfter = content.slice(lastIndex);
    if (textAfter.trim()) {
      const textEl = document.createElement("div");
      renderFormattedText(textAfter, textEl);
      applyKatex(textEl);
      bubbleEl.appendChild(textEl);
    }
  } else {
    // No graphs — render with safe markdown and KaTeX
    renderFormattedText(content, bubbleEl);
    applyKatex(bubbleEl);
  }

  // Render any graphs after the elements are in the DOM so Function Plot can
  // measure container dimensions correctly.
  if (bubbleEl.classList.contains("has-graph")) {
    waitForFunctionPlot().then(() => {
      requestAnimationFrame(() => {
        bubbleEl.querySelectorAll(".graph-container").forEach(container => {
          const expression = container.dataset.expression || "";
          let params = [];
          // Wrap JSON.parse in try/catch so malformed data doesn't crash the app.
          try {
            params = JSON.parse(container.dataset.params || "[]");
          } catch {
            params = [];
          }

          const isTrig = /\b(sin|cos|tan)\b/.test(expression);
          const xDomain = isTrig ? [-2 * Math.PI, 2 * Math.PI] : [-10, 10];
          const scope = {};
          params.forEach(p => { scope[p.name] = p.default; });

          function renderGraph() {
            try {
              while (container.firstChild) container.removeChild(container.firstChild);
              functionPlot({
                target: "#" + container.id,
                width: container.offsetWidth || 400,
                height: 300,
                grid: true,
                xAxis: { domain: xDomain },
                data: [{ fn: expression, graphType: "polyline", scope: Object.assign({}, scope) }]
              });
            } catch {
              while (container.firstChild) container.removeChild(container.firstChild);
              const errorEl = document.createElement("div");
              errorEl.className = "graph-error";
              errorEl.textContent = "This graph couldn\u2019t be displayed \u2014 try asking the tutor to rephrase the equation.";
              container.appendChild(errorEl);
            }
          }

          renderGraph();

          // Hook up sliders
          const slidersDiv = container.nextElementSibling;
          if (slidersDiv && slidersDiv.classList.contains("graph-sliders")) {
            slidersDiv.querySelectorAll("input[type='range']").forEach(slider => {
              slider.addEventListener("input", () => {
                scope[slider.dataset.paramName] = parseFloat(slider.value);
                const valueDisplay = slider.nextElementSibling;
                if (valueDisplay) valueDisplay.textContent = parseFloat(slider.value).toFixed(1);
                renderGraph();
              });
            });
          }
        });
      });
    }).catch(() => {
      bubbleEl.querySelectorAll(".graph-container").forEach(container => {
        const errorEl = document.createElement("div");
        errorEl.className = "graph-error";
        errorEl.textContent = "The graphing library is still loading. Please try asking again in a moment.";
        container.appendChild(errorEl);
      });
    });
  }
}

// ============================================================
// STREAMING HELPERS
// ============================================================

/**
 * Creates a placeholder streaming bubble with a typing indicator.
 * Returns { messageEl, bubbleEl }.
 */
function createStreamingBubble() {
  const messageEl = document.createElement("div");
  messageEl.className = "message assistant";

  const bubbleEl = document.createElement("div");
  bubbleEl.className = "message-bubble";

  const indicator = document.createElement("span");
  indicator.className = "typing-indicator";
  indicator.setAttribute("aria-label", "Tutor is typing");
  for (let i = 0; i < 3; i++) {
    indicator.appendChild(document.createElement("span"));
  }
  bubbleEl.appendChild(indicator);

  messageEl.appendChild(bubbleEl);
  chat.appendChild(messageEl);
  chat.scrollTop = chat.scrollHeight;
  return { messageEl, bubbleEl };
}

/**
 * Updates the streaming bubble with raw accumulated text (no KaTeX yet).
 */
function updateStreamingBubble(bubbleEl, text) {
  // Remove typing indicator if still present
  const indicator = bubbleEl.querySelector(".typing-indicator");
  if (indicator) bubbleEl.removeChild(indicator);
  // Show raw text during streaming (formatted render happens on finalise)
  while (bubbleEl.firstChild) bubbleEl.removeChild(bubbleEl.firstChild);
  bubbleEl.textContent = text;
  chat.scrollTop = chat.scrollHeight;
}

/**
 * Replaces raw streaming text with fully-formatted content (markdown + KaTeX + graphs).
 */
function finalizeStreamingBubble(bubbleEl, content) {
  while (bubbleEl.firstChild) bubbleEl.removeChild(bubbleEl.firstChild);
  renderAssistantContent(bubbleEl, content);
  chat.scrollTop = chat.scrollHeight;
}

// ============================================================
// SUGGESTION CHIPS
// ============================================================
const SUGGESTION_CHIPS = [
  "How do I solve quadratic equations?",
  "What is the Pythagorean theorem?",
  "Explain fractions",
  "Graph y = sin(x)"
];

function buildSuggestionChips() {
  const container = document.createElement("div");
  container.className = "suggestion-chips";
  container.setAttribute("aria-label", "Suggested questions");

  SUGGESTION_CHIPS.forEach(text => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "suggestion-chip";
    chip.textContent = text;
    chip.addEventListener("click", () => {
      userInput.value = text;
      // Trigger auto-resize
      userInput.style.height = "auto";
      userInput.style.height = Math.min(userInput.scrollHeight, 200) + "px";
      form.requestSubmit();
    });
    container.appendChild(chip);
  });

  return container;
}

// ============================================================
// CHAT RESET
// ============================================================
function resetChat() {
  messages = [];
  sessionStorage.removeItem("mathTutorMessages");
  currentImage = null;
  imagePreviewImg.src = "";
  imagePreviewContainer.style.display = "none";

  while (chat.firstChild) chat.removeChild(chat.firstChild);

  // Welcome message
  const welcomeEl = document.createElement("div");
  welcomeEl.className = "message assistant";
  const welcomeBubble = document.createElement("div");
  welcomeBubble.className = "message-bubble";
  welcomeBubble.textContent =
    "Hi! I\u2019m your math tutor. Ask me a math question, and I\u2019ll help guide you step by step instead of just giving the answer.";
  welcomeEl.appendChild(welcomeBubble);
  chat.appendChild(welcomeEl);

  // Suggestion chips below the welcome message
  chat.appendChild(buildSuggestionChips());

  statusDiv.textContent = "";
  statusDiv.classList.remove("error");
}

clearButton.addEventListener("click", resetChat);

// ============================================================
// SUBSCRIPT MODE
// ============================================================
const SUBSCRIPT_MAP = {
  "0": "\u2080", "1": "\u2081", "2": "\u2082", "3": "\u2083", "4": "\u2084",
  "5": "\u2085", "6": "\u2086", "7": "\u2087", "8": "\u2088", "9": "\u2089"
};

let subscriptMode = false;
const subscriptButton = document.getElementById("subscript-toggle");

subscriptButton.addEventListener("click", () => {
  subscriptMode = !subscriptMode;
  subscriptButton.classList.toggle("active", subscriptMode);
  userInput.focus();
});

// ============================================================
// MATH TOOLBAR
// ============================================================
document.getElementById("math-toolbar").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-insert]");
  if (!button) return;

  const insertText = button.dataset.insert;
  const cursorOffset = button.dataset.cursorOffset ? parseInt(button.dataset.cursorOffset, 10) : 0;
  const start = userInput.selectionStart;
  const end = userInput.selectionEnd;

  userInput.value = userInput.value.slice(0, start) + insertText + userInput.value.slice(end);

  const newCursor = start + insertText.length + cursorOffset;
  userInput.setSelectionRange(newCursor, newCursor);
  userInput.focus();
  // Trigger auto-resize after toolbar insert
  userInput.dispatchEvent(new Event("input"));
});

// ============================================================
// TEXTAREA AUTO-RESIZE
// ============================================================
userInput.addEventListener("input", () => {
  userInput.style.height = "auto";
  userInput.style.height = Math.min(userInput.scrollHeight, 200) + "px";
});

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
userInput.addEventListener("keydown", (event) => {
  // Subscript mode: intercept number keys (0-9)
  if (subscriptMode && SUBSCRIPT_MAP[event.key]) {
    event.preventDefault();
    const start = userInput.selectionStart;
    const end = userInput.selectionEnd;
    const sub = SUBSCRIPT_MAP[event.key];
    userInput.value = userInput.value.slice(0, start) + sub + userInput.value.slice(end);
    userInput.setSelectionRange(start + sub.length, start + sub.length);
    subscriptMode = false;
    subscriptButton.classList.remove("active");
    return;
  }
  // Ctrl+Enter / Cmd+Enter to submit
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    form.requestSubmit();
  }
});

// ============================================================
// IMAGE UPLOAD
// ============================================================
let currentImage = null; // { dataUrl: string, type: string } | null

function handleImageFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    statusDiv.textContent = "Please upload a valid image file (PNG, JPG, GIF, WebP).";
    statusDiv.classList.add("error");
    return;
  }
  const maxSize = 5 * 1024 * 1024; // 5 MB
  if (file.size > maxSize) {
    statusDiv.textContent = "Image is too large. Please use an image under 5 MB.";
    statusDiv.classList.add("error");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    currentImage = { dataUrl: e.target.result, type: file.type };
    imagePreviewImg.src = e.target.result;
    imagePreviewContainer.style.display = "flex";
    statusDiv.textContent = "";
    statusDiv.classList.remove("error");
  };
  reader.readAsDataURL(file);
}

// File picker via hidden <input>
uploadButton.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) {
    handleImageFile(fileInput.files[0]);
    fileInput.value = ""; // Reset so the same file can be re-selected
  }
});

// Remove preview
removeImageButton.addEventListener("click", () => {
  currentImage = null;
  imagePreviewImg.src = "";
  imagePreviewContainer.style.display = "none";
});

// Drag and drop onto the textarea
userInput.addEventListener("dragover", (e) => {
  e.preventDefault();
  userInput.classList.add("drag-over");
});

userInput.addEventListener("dragleave", () => {
  userInput.classList.remove("drag-over");
});

userInput.addEventListener("drop", (e) => {
  e.preventDefault();
  userInput.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) handleImageFile(file);
});

// Paste from clipboard (Ctrl+V / Cmd+V)
userInput.addEventListener("paste", (e) => {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      e.preventDefault();
      handleImageFile(item.getAsFile());
      return;
    }
  }
});

// ============================================================
// DOWNLOAD CHAT
// ============================================================
downloadButton.addEventListener("click", () => {
  if (messages.length === 0) {
    statusDiv.textContent = "No conversation to download yet.";
    statusDiv.classList.add("error");
    return;
  }

  const lines = messages.map(msg => {
    const role = msg.role === "user" ? "You" : "Math Tutor";
    let text;
    if (typeof msg.content === "string") {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      const textParts = msg.content.filter(c => c.type === "text").map(c => c.text);
      const hasImage = msg.content.some(c => c.type === "image_url");
      text = (hasImage ? "[Image attached] " : "") + textParts.join("");
    } else {
      text = "";
    }
    return role + ":\n" + text;
  });

  const fullText =
    "AI Math Tutor Conversation\n" +
    "=".repeat(30) + "\n\n" +
    lines.join("\n\n---\n\n");

  const blob = new Blob([fullText], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "math-tutor-chat.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ============================================================
// FORM SUBMIT (with streaming support)
// ============================================================
form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const text = userInput.value.trim();
  const hasImage = !!currentImage;

  if (!text && !hasImage) {
    statusDiv.textContent = "Please enter a math question or attach an image.";
    statusDiv.classList.add("error");
    return;
  }

  // Build message content — vision format when an image is attached.
  let userContent;
  if (hasImage) {
    userContent = [
      { type: "image_url", image_url: { url: currentImage.dataUrl } }
    ];
    if (text) {
      userContent.unshift({ type: "text", text });
    }
  } else {
    userContent = text;
  }

  // Remove suggestion chips once the user sends their first message
  const chipsContainer = chat.querySelector(".suggestion-chips");
  if (chipsContainer) chat.removeChild(chipsContainer);

  // Render user message bubble
  renderMessageBubble("user", userContent);
  messages.push({ role: "user", content: userContent });
  saveChatHistory();

  // Clear input state
  userInput.value = "";
  userInput.style.height = "auto";
  currentImage = null;
  imagePreviewImg.src = "";
  imagePreviewContainer.style.display = "none";

  statusDiv.textContent = "Tutor is thinking\u2026";
  statusDiv.classList.remove("error");
  sendButton.disabled = true;
  clearButton.disabled = true;
  downloadButton.disabled = true;
  sendButton.textContent = "Sending\u2026";

  // Cap history sent to the API
  const trimmedMessages = messages.slice(-MAX_HISTORY);

  // Create the streaming bubble (typing indicator)
  const { bubbleEl } = createStreamingBubble();

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: storedPassword, messages: trimmedMessages, stream: true })
    });

    if (!response.ok) {
      let errMsg = "Something went wrong.";
      try {
        const errData = await response.json();
        errMsg = errData.error || errMsg;
      } catch {
        // Ignore parse errors
      }
      throw new Error(errMsg);
    }

    const contentType = response.headers.get("Content-Type") || "";
    let answer = "";

    if (contentType.includes("text/event-stream") && response.body) {
      // ── Streaming path ────────────────────────────────────────────────────
      // Parse Server-Sent Events from the Groq streaming response.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // Keep the last (potentially incomplete) line

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break outer;
          try {
            const parsed = JSON.parse(data);
            const token = parsed.choices && parsed.choices[0] &&
              parsed.choices[0].delta && parsed.choices[0].delta.content
              ? parsed.choices[0].delta.content : "";
            if (token) {
              answer += token;
              updateStreamingBubble(bubbleEl, answer);
            }
          } catch {
            // Skip malformed SSE chunks
          }
        }
      }
    } else {
      // ── Non-streaming fallback (JSON response) ────────────────────────────
      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error("Invalid server response.");
      }
      answer = data.answer || "I\u2019m sorry, I couldn\u2019t generate a response.";
    }

    if (!answer) answer = "I\u2019m sorry, I couldn\u2019t generate a response.";

    // Final render: apply markdown, KaTeX, and graph rendering
    finalizeStreamingBubble(bubbleEl, answer);
    messages.push({ role: "assistant", content: answer });
    saveChatHistory();
    statusDiv.textContent = "Done.";

  } catch (error) {
    // Remove the incomplete streaming bubble on error
    if (bubbleEl.parentElement) chat.removeChild(bubbleEl.parentElement);
    statusDiv.textContent = "Error: " + error.message;
    statusDiv.classList.add("error");
    renderMessageBubble("assistant", "Sorry \u2014 something went wrong. Please try again.");
  } finally {
    sendButton.disabled = false;
    clearButton.disabled = false;
    downloadButton.disabled = false;
    sendButton.textContent = "Send";
    userInput.focus();
  }
});

// ============================================================
// INITIALISE
// ============================================================
resetChat();
