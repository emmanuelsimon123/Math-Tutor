# Cloudflare Worker — Setup Guide

This directory contains the Cloudflare Worker backend for the AI Math Tutor.

## What it does

| Endpoint | Method | Description |
|---|---|---|
| `/auth` | POST | Validates the student class password. |
| `/solve` | POST | Forwards the conversation to Groq, streams the Socratic response back. |

**Security features built in:**

- Origin-locked CORS (only your GitHub Pages URL is accepted).
- Rate limiting — 30 requests per minute per IP.
- Input validation — 4,000 character cap per message, 20 message cap.
- Server-side password validation (never exposed in the frontend).
- Only `data:image/...` base64 URLs accepted for images (no arbitrary remote URLs).

---

## Prerequisites

1. A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works).
2. A [Groq API key](https://console.groq.com) (free tier works).
3. [Node.js](https://nodejs.org) ≥ 18 and [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) installed.

```bash
npm install -g wrangler
```

---

## Deployment

### 1. Clone / enter the worker directory

```bash
cd worker/
```

### 2. Authenticate with Cloudflare

```bash
wrangler login
```

### 3. Edit `wrangler.toml`

Update `ALLOWED_ORIGIN` to match your GitHub Pages URL:

```toml
[vars]
ALLOWED_ORIGIN = "https://your-username.github.io"
```

> **Note:** If you are serving the app from a custom path (e.g.
> `https://username.github.io/Math-Tutor`), set `ALLOWED_ORIGIN` to the
> *origin only* — `https://username.github.io` — not the full path.

### 4. Set secrets

```bash
wrangler secret put STUDENT_PASSWORD
# (paste your class password when prompted)

wrangler secret put GROQ_API_KEY
# (paste your Groq API key when prompted)
```

### 5. Deploy

```bash
wrangler deploy
```

Wrangler will print the Worker URL, e.g.:

```
https://ai-math-tutor-worker.your-subdomain.workers.dev
```

### 6. Update the frontend

Open `script.js` and update the `WORKER_BASE_URL` constant at the top of
the file to your Worker URL:

```js
// ── CONFIG ────────────────────────────────────────────────────────────────
// Change this to your Cloudflare Worker deployment URL.
const WORKER_BASE_URL = "https://ai-math-tutor-worker.your-subdomain.workers.dev";
```

---

## Environment variables reference

| Variable | Type | Description |
|---|---|---|
| `STUDENT_PASSWORD` | Secret | Class password students enter to log in. |
| `GROQ_API_KEY` | Secret | Your Groq API key. |
| `ALLOWED_ORIGIN` | Var | Your GitHub Pages origin URL (for CORS). |

---

## AI Models

The worker automatically selects the best model based on the request:

| Request type | Model used |
|---|---|
| Text-only | `llama-3.1-8b-instant` |
| Image / screenshot | `llama-3.2-90b-vision-preview` |

To change the model, edit the `TEXT_MODEL` or `VISION_MODEL` constants in
`index.js`. See [Groq's model list](https://console.groq.com/docs/models) for
all available options.

---

## Local development

```bash
wrangler dev
```

The Worker will run on `http://localhost:8787`.  Update `WORKER_BASE_URL` in
`script.js` to `http://localhost:8787` for local testing.  Note that
`ALLOWED_ORIGIN` checks are skipped automatically when no value is configured,
so local requests will work without CORS restrictions.
