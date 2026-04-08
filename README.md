# AI Math Tutor

An AI-powered Socratic math tutor that helps middle and high school students think through problems step by step — rather than just handing them the answer.

**Live demo:** [https://emmanuelsimon123.github.io/Math-Tutor/](https://emmanuelsimon123.github.io/Math-Tutor/)

---

## Features

- **Password-protected access** — Students enter a class password to use the tutor. Keeps the tool private to your classroom.
- **Socratic step-by-step guidance** — The tutor asks guiding questions to help students discover answers on their own instead of giving away solutions.
- **Math rendering with KaTeX** — AI responses display proper mathematical notation (fractions, exponents, square roots, equations, etc.).
- **Interactive graphs** — The tutor can graph functions directly in the chat using Function Plot. Students can hover over points to see coordinates.
- **Parameterized graph sliders** — For topics like transformations, the tutor provides interactive sliders so students can drag parameters (like `h` and `k`) and watch the graph change in real time.
- **Math symbol toolbar** — One-click buttons for exponents, square roots, π, trig functions, logarithms, subscripts, and more.
- **Smart subscript mode** — Toggle subscript mode, then type any number (0–9) to insert it as a subscript (x₀ through x₉).
- **Streaming responses** — AI responses appear token-by-token as they arrive, just like modern chat interfaces. Final KaTeX and graph rendering runs once the full response is received.
- **📷 Photo / screenshot upload** — Upload a photo or screenshot of a math problem instead of typing it out. Supports:
  - File picker (PNG, JPG, GIF, WebP)
  - Drag and drop onto the input area
  - Paste from clipboard (Ctrl+V / Cmd+V)
  - Preview thumbnail with a one-click remove button
  - The image is sent to an AI vision model that can read and analyse the problem
- **Dark mode** — Full dark theme support via `prefers-color-scheme: dark` (automatic) plus a manual 🌙/☀️ toggle button. Your preference is saved across sessions.
- **Persist chat history** — The conversation is saved to `sessionStorage` so students don't lose progress if they refresh the page within the same session.
- **Download Chat** — A "Download Chat" button exports the full conversation as a plain-text `.txt` file for studying later.
- **Suggestion chips** — Clickable topic chips in the welcome state help students who don't know where to start (e.g. *"How do I solve quadratic equations?"*, *"Graph y = sin(x)"*).
- **Auto-resize textarea** — The input field grows as you type (up to 200 px) and shrinks back when cleared.
- **Chat interface** — Conversational UI keeps context across multiple exchanges in a session.
- **Responsive design** — Works on desktops, tablets, and phones.
- **Keyboard shortcut** — Press **Ctrl+Enter** (or **Cmd+Enter** on Mac) to send a message quickly.
- **New Chat button** — Clears the conversation and starts fresh.
- **Rate limiting** — Server-side protection (30 requests/minute per IP) prevents abuse and excessive token usage.
- **Accessible** — ARIA labels on toolbar buttons, live regions for status updates, keyboard-navigable.

---

## How to Use

### For teachers
1. Deploy the frontend via GitHub Pages (or any static host).
2. Deploy the Cloudflare Worker with your Groq API key and student password as environment secrets (see `worker/README.md`).
3. Update `WORKER_BASE_URL` at the top of `script.js` to point to your Worker.
4. Share the URL and class password with your students.
5. To rotate the password, update the `STUDENT_PASSWORD` secret in Cloudflare.

### For students
1. Open the link your teacher gave you.
2. Enter the class password.
3. Type a math question **or** click 📷 to upload a photo/screenshot of your problem.
4. The tutor will guide you step by step!

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, vanilla JavaScript |
| Math rendering | [KaTeX](https://katex.org/) via CDN |
| Graphing | [Function Plot](https://mauriciopoppe.github.io/function-plot/) + [D3.js](https://d3js.org/) via CDN |
| Backend | [Cloudflare Workers](https://workers.cloudflare.com/) |
| AI model (text) | [Groq](https://groq.com/) — Llama 3.1 8B Instant |
| AI model (vision) | [Groq](https://groq.com/) — Llama 3.2 90B Vision |
| Auth | Password validated server-side via Cloudflare Worker |

---

## Architecture

```
Student opens page → Login screen
        ↓ enters class password
POST /auth { password } → Cloudflare Worker validates
        ↓ success
Chat interface loads
        ↓ student asks a question (text and/or image)
POST /solve { password, messages, stream: true } → Worker validates password + rate limit
        ↓
Worker prepends Socratic system prompt → Groq API (streaming)
        ↓
SSE token stream → browser renders token-by-token → final KaTeX + Function Plot pass
```

The frontend sends the conversation history (capped at 20 messages) to a Cloudflare Worker. The Worker validates the password, checks the rate limit, prepends a Socratic system prompt, and forwards the conversation to the Groq API. Responses are streamed back using Server-Sent Events (SSE) and rendered with KaTeX for math notation and Function Plot for interactive graphs. When an image is attached, the vision-capable model is used automatically.

The full backend code lives in the `worker/` directory — see [`worker/README.md`](worker/README.md) for setup instructions.

---

## Security

- **Server-side password validation** — passwords are checked by the Cloudflare Worker, never exposed in frontend code.
- **Origin-locked CORS** — only requests from the GitHub Pages domain are accepted.
- **No innerHTML** — all DOM manipulation uses safe methods (`createElement`, `textContent`, `appendChild`) to prevent XSS.
- **Graph expression sanitization** — expression strings are validated against an allowlist of safe characters before being passed to the graphing library.
- **Image validation** — only base64 `data:image/...` URLs are forwarded to the AI; arbitrary remote URLs are rejected.
- **Rate limiting** — 30 requests/minute per IP to prevent abuse.
- **Input validation** — message length caps (4,000 chars), conversation length caps (20 messages).
- **Session-based auth** — password stored in `sessionStorage` (cleared when tab closes).

---

## GitHub Topics

Consider adding these topics to the repository for better discoverability:
`math` · `tutor` · `ai` · `education` · `javascript` · `cloudflare-workers` · `katex` · `groq` · `llm`

---

## License

This project is licensed under the [MIT License](LICENSE).
