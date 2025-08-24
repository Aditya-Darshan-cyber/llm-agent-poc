/* Browser LLM Agent (AI Pipe only) — Robust Prompts v16
   - OpenAI-style tool calling
   - Tools: google_search, ai_pipe, execute_javascript (sandboxed)
   - LLM provider: AI Pipe (OpenAI-compatible). Mock fallback if no token.
*/

const els = {
  alerts: document.getElementById('alerts'),
  model: document.getElementById('model'),
  aiPipeToken: document.getElementById('aiPipeToken'),
  aiPipeUrl: document.getElementById('aiPipeUrl'),
  googleCseId: document.getElementById('googleCseId'),
  googleApiKey: document.getElementById('googleApiKey'),
  saveConfig: document.getElementById('saveConfig'),
  resetConfig: document.getElementById('resetConfig'),
  helpBtn: document.getElementById('helpBtn'),
  conversation: document.getElementById('conversation'),
  userInput: document.getElementById('userInput'),
  sendBtn: document.getElementById('sendBtn'),
  sandbox: document.getElementById('sandbox'),
};

// --- Config ---
const defaultConfig = {
  model: 'gpt-4.1-nano',
  aiPipeToken: '',
  aiPipeUrl: '',
  googleCseId: '',
  googleApiKey: ''
};

function loadConfig() {
  try {
    const raw = localStorage.getItem('agent_config');
    const cfg = raw ? { ...defaultConfig, ...JSON.parse(raw) } : { ...defaultConfig };
    Object.entries(cfg).forEach(([k, v]) => { if (els[k]) els[k].value = v; });
  } catch {}
}

function saveConfig() {
  const cfg = {
    model: els.model.value.trim(),
    aiPipeToken: els.aiPipeToken.value.trim(),
    aiPipeUrl: els.aiPipeUrl.value.trim(),
    googleCseId: els.googleCseId.value.trim(),
    googleApiKey: els.googleApiKey.value.trim(),
  };
  localStorage.setItem('agent_config', JSON.stringify(cfg));
  showAlert('Configuration saved.', 'success');
}

function resetConfig() {
  Object.entries(defaultConfig).forEach(([k, v]) => { if (els[k]) els[k].value = v; });
  saveConfig();
}

function getCfg() {
  return {
    model: els.model.value.trim() || 'gpt-4.1-nano',
    aiPipeToken: els.aiPipeToken.value.trim(),
    aiPipeUrl: els.aiPipeUrl.value.trim(),
    googleCseId: els.googleCseId.value.trim(),
    googleApiKey: els.googleApiKey.value.trim(),
  };
}

// --- Alerts & UI helpers ---
function showAlert(msg, type = 'warning') {
  const div = document.createElement('div');
  div.className = `alert alert-${type} alert-dismissible fade show`;
  div.innerHTML = `
    <div>${escapeHtml(msg)}</div>
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;
  els.alerts.appendChild(div);
}

function escapeHtml(s = '') {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function appendMessage(role, html) {
  const wrap = document.createElement('div');
  wrap.className = `msg msg-${role}`;
  wrap.innerHTML = html;
  els.conversation.appendChild(wrap);
  els.conversation.scrollTop = els.conversation.scrollHeight;
}

function copyText(text) {
  navigator.clipboard?.writeText(text).then(() => showAlert('Copied to clipboard.', 'success'));
}

function renderToolCard(title, bodyHtml, rawTextForCopy) {
  return `
    <div class="card tool-card my-2">
      <div class="card-header d-flex justify-content-between align-items-center">
        <strong>${escapeHtml(title)}</strong>
        <button class="btn btn-sm btn-outline-light" onclick="copyText(${JSON.stringify(rawTextForCopy)})" title="Copy JSON">
          <i class="fa-regular fa-copy"></i>
        </button>
      </div>
      <div class="card-body small">${bodyHtml}</div>
    </div>
  `;
}

// --- Sandbox JS execution (iframe + postMessage) ---
const sandboxPending = new Map();
window.addEventListener('message', (ev) => {
  const data = ev.data || {};
  if (data.type === 'EXEC_JS_RESULT' && data.id && sandboxPending.has(data.id)) {
    const { resolve } = sandboxPending.get(data.id);
    sandboxPending.delete(data.id);
    resolve({ logs: data.logs || [], result: data.result, error: data.error });
  }
});
function runInSandbox(code) {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2);
    sandboxPending.set(id, { resolve });
    els.sandbox.contentWindow.postMessage({ type: 'EXEC_JS', id, code }, '*');
  });
}

// --- Tools (OpenAI-style tool specs) ---
const tools = [
  {
    type: "function",
    function: {
      name: "google_search",
      description: "Search the web and return top snippet results.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "integer", description: "Max results", default: 5 }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ai_pipe",
      description: "Call AI Pipe workflow OR use AI Pipe's OpenAI Responses proxy for small transforms (e.g., summarize).",
      parameters: {
        type: "object",
        properties: {
          workflow: { type: "string", description: "Workflow name (e.g., summarize, extract, outline, rewrite)" },
          data: { type: "string", description: "Input text or JSON string" }
        },
        required: ["data"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_javascript",
      description: "Run JavaScript safely in a sandboxed iframe and return console logs + result.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "JavaScript code to execute" }
        },
        required: ["code"]
      }
    }
  }
];

// --- Tool executors ---
async function tool_google_search(args) {
  const { googleCseId, googleApiKey } = getCfg();
  const query = (args?.query || '').toString();
  const limit = Math.min(10, Math.max(1, parseInt(args?.limit || 5, 10)));

  // Prefer Google CSE if keys present
  if (googleCseId && googleApiKey) {
    try {
      const url = new URL('https://www.googleapis.com/customsearch/v1');
      url.searchParams.set('key', googleApiKey);
      url.searchParams.set('cx', googleCseId);
      url.searchParams.set('q', query);
      const r = await fetch(url);
      const j = await r.json();
      const items = (j.items || []).slice(0, limit).map(it => ({
        title: it.title, link: it.link, snippet: it.snippet
      }));
      return { provider: 'google-cse', query, results: items };
    } catch (e) {
      showAlert(`Google CSE failed: ${e}`, 'danger');
    }
  }

  // Fallback: DuckDuckGo Instant Answer API + Wikipedia search (CORS-friendly)
  try {
    const ddgUrl = new URL('https://api.duckduckgo.com/');
    ddgUrl.searchParams.set('q', query);
    ddgUrl.searchParams.set('format', 'json');
    ddgUrl.searchParams.set('no_redirect', '1');
    ddgUrl.searchParams.set('no_html', '1');
    const r = await fetch(ddgUrl);
    const j = await r.json();
    const results = [];

    if (j.AbstractText) results.push({ title: j.Heading || 'DuckDuckGo', link: j.AbstractURL || '', snippet: j.AbstractText });
    (j.RelatedTopics || []).forEach(rt => {
      if (results.length >= limit) return;
      if (rt.Text) results.push({ title: rt.Text.slice(0, 60), link: rt.FirstURL || '', snippet: rt.Text });
    });

    if (results.length < limit) {
      const wiki = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`);
      const wj = await wiki.json();
      (wj?.query?.search || []).slice(0, limit - results.length).forEach(s => {
        results.push({
          title: s.title,
          link: `https://en.wikipedia.org/wiki/${encodeURIComponent(s.title.replace(/\s/g,'_'))}`,
          snippet: s.snippet?.replace(/<\/?span[^>]*>/g,'').replace(/&quot;/g,'"') || ''
        });
      });
    }

    return { provider: 'fallback', query, results: results.slice(0, limit) };
  } catch (e) {
    showAlert(`Fallback search failed: ${e}`, 'danger');
    return { provider: 'fallback', query, results: [] };
  }
}

function buildTransformPrompt(workflow, data) {
  return `
You are an expert text transformer that operates strictly on the PROVIDED_INPUT.
Task: ${workflow || 'outline'}  (if unclear, treat as 'outline' or 'summarize' as appropriate)
Rules:
1) Be brief by default (≤120 words) unless asked otherwise.
2) Use only facts in PROVIDED_INPUT. If something is missing, write: "not in input".
3) Preserve numbers, units, names, quotes; do not alter quantities.
4) If summarizing: produce 3–5 bullets covering What/Why/How/Numbers.
5) If extracting: return VALID JSON with only keys you actually found.
6) If rewriting/translating: preserve meaning & entities; note uncertainties.
7) If input is long, first create short section-wise bullets, then a final synthesis.
8) Append one line at end: Summary: <very short gist>.

PROVIDED_INPUT:
<<<
${data}
>>>

Return only the final output (no preface).`.trim();
}

async function tool_ai_pipe(args) {
  const { aiPipeUrl, aiPipeToken, model } = getCfg();
  const workflow = (args?.workflow || 'summarize').toString();
  const data = (args?.data || '').toString();

  // 1) Custom AI Pipe workflow endpoint (if provided)
  if (aiPipeUrl) {
    try {
      const r = await fetch(aiPipeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow, data })
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      return { workflow, output: j.output ?? j, confidence: j.confidence ?? null };
    } catch (e) {
      showAlert(`AI Pipe custom workflow failed: ${e}`, 'danger');
    }
  }

  // 2) AI Pipe OpenAI Responses proxy (if token is available)
  if (aiPipeToken) {
    try {
      const resp = await fetch('https://aipipe.org/openai/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiPipeToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model || 'gpt-4.1-nano',
          input: buildTransformPrompt(workflow, data)
        })
      });
      const j = await resp.json();
      const text = j?.output?.[0]?.content?.[0]?.text ?? j?.output_text ?? JSON.stringify(j);
      return { workflow: `${workflow}@aipipe`, output: text, raw: j };
    } catch (e) {
      showAlert(`AI Pipe /openai/v1/responses failed: ${e}`, 'danger');
    }
  }

  // 3) Mock fallback
  return {
    workflow,
    output: data.length > 160 ? data.slice(0, 157) + '...' : data,
    confidence: 0.42
  };
}

async function tool_execute_javascript(args) {
  const code = (args?.code || '').toString();
  const out = await runInSandbox(code);
  return { logs: out.logs || [], result: out.result ?? null, error: out.error ?? null };
}

// Tool-call router
async function handleToolCall(tc) {
  try {
    const { function: fn } = tc;
    const name = fn?.name;
    const args = fn?.arguments ? JSON.parse(fn.arguments) : {};
    if (name === 'google_search')      return await tool_google_search(args);
    if (name === 'ai_pipe')            return await tool_ai_pipe(args);
    if (name === 'execute_javascript') return await tool_execute_javascript(args);
    return { error: `Unknown tool: ${name}` };
  } catch (e) {
    return { error: String(e?.message || e) };
  }
}

// --- LLM call via AI Pipe (or mock) ---
const systemPrompt = {
  role: "system",
  content: [
    "You are a browser-based agent. Keep responses brief and useful.",
    "If user intent is ambiguous or multi-goal, propose a brief plan (numbered steps) and ask one high-leverage clarifying question if essential.",
    "Prefer official/primary sources and state explicit dates when queries imply recency (‘latest’, ‘today’).",
    "Cross-check ≥2 reputable sources when facts conflict; present disagreement and a short confidence note.",
    "Use multi-tool chains when helpful (search→summarize→compute) and state the plan briefly.",
    "When using search results, cite links inline; if unknown, say ‘not found’—do not fabricate.",
    "For non-trivial calculations, use execute_javascript to verify; show formula and computed value.",
    "For very long inputs, chunk logically and summarize per chunk before a final synthesis.",
    "Carry forward key facts from tool results as brief ‘Notes:’ (keep them short).",
    "If a source is paywalled/unreachable, say so and seek alternative reputable sources; never invent hidden content.",
    "Translate relative dates into explicit dates when possible; if unsure, ask for locale/timeframe.",
    "Decline unsafe/illegal requests and suggest safe, high-level alternatives.",
    "On empty/failed search, retry once with a refined query (keywords, site filters). If still empty, say so and propose next steps.",
    "Honor explicit output formats (JSON/table). Validate JSON and keep it minimal.",
    "Be concise; prefer few tool calls; ask before heavy operations.",
    "If user forbids tools, comply; answer text-only and note limitations/uncertainty.",
  ].join("\n")
};

async function callLLM(messages) {
  const { aiPipeToken, model } = getCfg();

  // No token? Use the mock brain to keep the demo running.
  if (!aiPipeToken) return mockLLM(messages);

  try {
    const r = await fetch('https://aipipe.org/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiPipeToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        tools,
        tool_choice: "auto"
      })
    });
    const j = await r.json();
    const choice = j.choices?.[0]?.message || {};
    return {
      content: choice.content || '',
      tool_calls: choice.tool_calls || []
    };
  } catch (e) {
    showAlert(`LLM call (AI Pipe) failed: ${e}`, 'danger');
    return { content: '', tool_calls: [] };
  }
}

// --- Very small mock brain (unchanged heuristics; UX-only) ---
function mockLLM(messages) {
  const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  const wantsSearch = /search|IBM|latest|look up|google/i.test(lastUser);
  const wantsCode = /run code|execute|javascript|js/i.test(lastUser);

  if (wantsSearch) {
    return {
      content: "Let me search that.",
      tool_calls: [{
        type: "function",
        function: { name: "google_search", arguments: JSON.stringify({ query: lastUser, limit: 5 }) }
      }]
    };
  }
  if (wantsCode) {
    return {
      content: "Executing JavaScript in the sandbox.",
      tool_calls: [{
        type: "function",
        function: { name: "execute_javascript", arguments: JSON.stringify({ code: "console.log('Hello from sandbox'); return 2+2;" }) }
      }]
    };
  }
  if (/summarize|pipeline|ai pipe|aipipe/i.test(lastUser)) {
    return {
      content: "Calling AI Pipe to summarize.",
      tool_calls: [{
        type: "function",
        function: { name: "ai_pipe", arguments: JSON.stringify({ workflow: "summarize", data: lastUser }) }
      }]
    };
  }
  return { content: "OK. What’s next?", tool_calls: [] };
}

// --- Agent loop ---
let conversation = [systemPrompt];

async function agentStep() {
  const { content, tool_calls } = await callLLM(conversation);

  if (content && content.trim()) {
    appendMessage('assistant', `<div>${escapeHtml(content)}</div>`);
    conversation.push({ role: 'assistant', content });
  }

  if (tool_calls && tool_calls.length) {
    for (const tc of tool_calls) {
      const name = tc.function?.name || 'tool';
      const result = await handleToolCall(tc);

      let cardHtml = '';
      if (name === 'google_search') {
        const items = (result?.results || []).map(r => `
          <div class="search-item mb-2">
            <div class="fw-semibold">${escapeHtml(r.title || '')}</div>
            ${r.link ? `<a href="${escapeHtml(r.link)}" target="_blank" rel="noreferrer">${escapeHtml(r.link)}</a>` : ''}
            <div class="text-secondary small">${escapeHtml(r.snippet || '')}</div>
          </div>
        `).join('') || `<div class="text-secondary">No results.</div>`;
        cardHtml = renderToolCard(`Search: ${result?.query || ''}`, items, JSON.stringify(result, null, 2));
      } else if (name === 'ai_pipe') {
        const raw = JSON.stringify(result, null, 2);
        cardHtml = renderToolCard(`AI Pipe (${result?.workflow})`, `<pre class="mb-0"><code class="language-json">${escapeHtml(raw)}</code></pre>`, raw);
      } else if (name === 'execute_javascript') {
        const raw = JSON.stringify(result, null, 2);
        const logs = (result?.logs || []).map(l => `<div><span class="badge bg-secondary me-2">${l.level}</span>${escapeHtml(String(l.args?.map(String).join(' ')))}</div>`).join('');
        const block = `
          <div class="mb-2">${logs || '<span class="text-secondary">No console output.</span>'}</div>
          <div><strong>Result:</strong> <code>${escapeHtml(String(result?.result))}</code></div>
          ${result?.error ? `<div class="text-danger mt-2">Error: ${escapeHtml(result.error)}</div>` : ''}
        `;
        cardHtml = renderToolCard('JavaScript Execution', block, raw);
      } else {
        const raw = JSON.stringify(result, null, 2);
        cardHtml = renderToolCard(name, `<pre class="mb-0"><code class="language-json">${escapeHtml(raw)}</code></pre>`, raw);
      }

      appendMessage('tool', cardHtml);

      conversation.push({
        role: 'tool',
        tool_call_id: tc.id || `${name}_${Date.now()}`,
        name,
        content: JSON.stringify(result)
      });
    }
    return agentStep(); // loop again so the model sees tool results
  }
  return; // wait for user
}

// --- UI events ---
els.saveConfig.addEventListener('click', saveConfig);
els.resetConfig.addEventListener('click', resetConfig);
els.helpBtn.addEventListener('click', () => {
  showAlert(
    [
      'Tools: google_search(query, limit), ai_pipe(workflow, data), execute_javascript(code).',
      'I plan multi-step tasks, clarify only when essential, and can chain tools (search→summarize→compute).',
      'For “latest”, I use official sources and state dates. If sources conflict, I show both with a brief confidence note.',
      'I cite links, avoid speculation, and can verify calculations via sandboxed JS.',
      'Long inputs are chunked then summarized; ask for JSON/table to control format.',
      'Say “no tools” for text-only mode.'
    ].join(' '),
    'info'
  );
});
els.sendBtn.addEventListener('click', onSend);
els.userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
});

function onSend() {
  const text = els.userInput.value.trim();
  if (!text) return;
  els.userInput.value = '';
  appendMessage('user', `<div>${escapeHtml(text)}</div>`);
  conversation.push({ role: 'user', content: text });
  agentStep();
}

// --- Init ---
loadConfig();
appendMessage('assistant', `<div>Hi! Paste your AI Pipe token, set a model, and send a message. I can plan multi-step tasks, use search/summarize/compute, cite sources, verify math in a sandbox, handle long inputs, and return JSON/tables when asked. If you prefer text-only, say “no tools”.</div>`);
