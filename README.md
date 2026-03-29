# AI Math Tutor

An AI-powered Socratic math tutor that helps students think through problems step by step — rather than just handing them the answer.

---

## Features

- **Socratic step-by-step guidance** — The tutor asks guiding questions to help students discover answers on their own.
- **Math rendering with KaTeX** — AI responses display proper mathematical notation (fractions, exponents, equations, etc.).
- **Chat interface** — Conversational UI keeps context across multiple exchanges in a session.
- **Responsive design** — Works on desktops, tablets, and phones.
- **Keyboard shortcut** — Press **Ctrl+Enter** (or **Cmd+Enter** on Mac) to send a message quickly.
- **New Chat button** — Clears the conversation and starts fresh.

---

## How to Use

### Run locally
1. Clone or download this repository.
2. Open `index.html` in any modern web browser — no server or build step required.

### Deploy via GitHub Pages
1. Push the repository to GitHub.
2. Go to **Settings → Pages** and set the source to the `main` branch (root folder).
3. GitHub Pages will publish the app at `https://<your-username>.github.io/<repo-name>/`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript (vanilla) |
| Math rendering | [KaTeX](https://katex.org/) (via CDN) |
| Backend | [Cloudflare Workers](https://workers.cloudflare.com/) |
| AI model | Cloudflare AI (accessed through the Worker) |

---

## Architecture

```
Browser (index.html + script.js)
        │
        │  POST /solve  { messages: [...] }
        ▼
Cloudflare Worker
        │
        │  Calls AI model with a Socratic system prompt
        ▼
AI model response → returned to browser → rendered with KaTeX
```

The frontend sends the current conversation history (capped at the last 20 messages to stay within token limits) to a Cloudflare Worker endpoint. The Worker prepends a system prompt that instructs the AI to act as a Socratic tutor, then forwards the conversation to an AI model and returns the response as JSON.

---

## License

This project is licensed under the [MIT License](LICENSE).
