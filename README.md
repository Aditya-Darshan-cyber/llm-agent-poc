# Browser LLM Agent (AI Pipe) — Multi-Tool POC

A minimal, hackable **browser-only** agent using **OpenAI-style tool calls** with **AI Pipe** (no backend).
It can search the web, run quick LLM transforms (summarize/extract/outline), and execute JavaScript in a sandbox.

---

## Features

- **Provider:** AI Pipe (OpenAI-compatible)
  - Chat Completions → `https://aipipe.org/openai/v1/chat/completions`
  - Responses (transforms) → `https://aipipe.org/openai/v1/responses`
  - Auth: `Authorization: Bearer <AI Pipe Token>`
- **Tools (function calling):**
  1) `google_search(query, limit)` → Google CSE if keys present; fallback: DDG + Wikipedia  
  2) `ai_pipe(workflow, data)` → custom workflow URL (optional) or AI Pipe Responses  
  3) `execute_javascript(code)` → sandboxed iframe; returns console logs + result
- **Design goals:** small codebase, clear UI, solid error alerts, easy to extend

---

## Quick Start

1. **Get an AI Pipe token**  
   Visit https://aipipe.org/login and sign in with Google. Copy your token.

2. **Run locally**  
   - Double-click `index.html`, or
   - Serve the folder:
     ```bash
     # choose one
     python -m http.server 8080
     npx serve -l 8080
     ```
     Open http://localhost:8080

3. **Configure (in the app)**  
   - **Model:** e.g. `gpt-4.1-nano` (cheap) or `gpt-4o-mini`  
   - **AI Pipe Token:** paste your token  
   - **AI Pipe URL (optional):** your workflow endpoint (POST `{workflow, data}`)  
   - **Google CSE ID / API Key (optional):** for higher-quality search  
   - Click **Save**

---

## Try These

- `Search IBM annual revenue 2023 site:ibm.com`
- `Summarize with AI Pipe: <paste 2–3 paragraphs>`
- `Run JS: console.log("hi"); return 21*2;`
- `Interview me to draft a blog post on climate tech; clarify only if essential.`

---

## How It Works

- **Loop:** user → Chat Completions (+ tools) → tool calls → tool results → model → …  
- **Search:** Google CSE if configured; else DDG + Wikipedia (CORS-friendly)  
- **AI Pipe tool:** custom workflow if provided; else AI Pipe **Responses** for transforms  
- **JS:** runs in a sandboxed iframe; collects `console` logs + return value

---

## Config Reference

| Field           | Required | Notes                                           |
|-----------------|----------|-------------------------------------------------|
| Model           | Yes      | `gpt-4.1-nano` (cheap) or `gpt-4o-mini`, etc.  |
| AI Pipe Token   | Yes      | From https://aipipe.org/login                   |
| AI Pipe URL     | No       | If set, `ai_pipe` POSTs `{workflow, data}`     |
| Google CSE ID   | No       | With API key for Google Custom Search           |
| Google API Key  | No       | With CSE ID for Google Custom Search            |

---

## Troubleshooting

- **401 / no response:** check token & model; click **Save**; see DevTools Console  
- **Search quality is poor:** add **CSE ID + API Key** or use precise queries (`site:`, year)  
- **Math doubts:** “verify via JS” — the agent runs sandboxed code and shows the result  
- **CORS quirks:** prefer serving via `http://localhost` over `file://`

---

## FAQ

- **Do I need Anthropic/Gemini?** No — AI Pipe alone satisfies the project.  
- **Most cost effective model?** Typically `gpt-5-mini` via AI Pipe.

---

## Credits

- AI Pipe — https://aipipe.org/  
- Google CSE, DuckDuckGo, Wikipedia APIs
