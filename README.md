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
- **Math symbol toolbar** — One-click buttons for exponents, square roots, π, trig functions, logarithms, subscripts, and more. No need to know how to type special characters.
- **Smart subscript mode** — Toggle subscript mode, then type any number (0–9) to insert it as a subscript (x₀ through x₉).
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
2. Deploy the Cloudflare Worker with your Groq API key and student password as environment secrets.
3. Share the URL and class password with your students.
4. To rotate the password, update the `STUDENT_PASSWORD` secret in Cloudflare.

### For students
1. Open the link your teacher gave you.
2. Enter the class password.
3. Ask any math question — the tutor will guide you step by step!

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, vanilla JavaScript |
| Math rendering | [KaTeX](https://katex.org/) via CDN |
| Graphing | [Function Plot](https://mauriciopoppe.github.io/function-plot/) + [D3.js](https://d3js.org/) via CDN |
| Backend | [Cloudflare Workers](https://workers.cloudflare.com/) |
| AI model | [Groq](https://groq.com/) (Llama 3.1 8B) |
| Auth | Password validated server-side via Cloudflare Worker |

---

## Architecture

```
Student opens page → Login screen
        ↓ enters class password
POST /auth { password } → Cloudflare Worker validates
        ↓ success
Chat interface loads
        ↓ student asks a question
POST /solve { password, messages } → Worker validates password + rate limit
        ↓
Worker prepends Socratic system prompt → Groq API
        ↓
AI response → returned to browser → rendered with KaTeX + Function Plot
```

The frontend sends the conversation history (capped at 20 messages) to a Cloudflare Worker. The Worker validates the password, checks the rate limit, prepends a Socratic system prompt, and forwards the conversation to the Groq API. Responses are rendered with KaTeX for math notation and Function Plot for interactive graphs.

---

## Security

- **Server-side password validation** — passwords are checked by the Cloudflare Worker, never exposed in frontend code.
- **Origin-locked CORS** — only requests from the GitHub Pages domain are accepted.
- **No innerHTML** — all DOM manipulation uses safe methods (createElement, textContent) to prevent XSS.
- **Rate limiting** — 30 requests/minute per IP to prevent abuse.
- **Input validation** — message length caps (4000 chars), conversation length caps (20 messages).
- **Session-based auth** — password stored in sessionStorage (cleared when tab closes).

---

## License

This project is licensed under the [MIT License](LICENSE).
