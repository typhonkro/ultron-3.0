// Tries several free models in order. If one is overloaded, slow or retired, it moves to the next.
const TIMEOUT_MS = 25000;
const list = (v, d) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : d);

// ---------- providers ----------
async function callGemini(key, model, system, history, message) {
  const contents = [...history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
                    { role: "user", parts: [{ text: message }] }];
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error?.message || `HTTP ${r.status}`), { status: r.status });
  const text = j?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim();
  if (!text) throw Object.assign(new Error("empty reply (possibly blocked)"), { status: 0 });
  return text;
}

async function callOpenAICompat(url, key, model, system, history, message, extraHeaders = {}) {
  const messages = [
    { role: "system", content: system },
    ...history.map((h) => ({ role: h.role === "model" ? "assistant" : "user", content: h.text })),
    { role: "user", content: message },
  ];
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, ...extraHeaders },
    body: JSON.stringify({ model, messages }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error?.message || `HTTP ${r.status}`), { status: r.status });
  const text = j?.choices?.[0]?.message?.content?.trim();
  if (!text) throw Object.assign(new Error("empty reply"), { status: 0 });
  return text;
}

function buildChain() {
  const chain = [];
  const g = process.env.GEMINI_API_KEY;
  if (g) for (const m of list(process.env.GEMINI_MODELS || process.env.GEMINI_MODEL, ["gemini-3.8-flash"]))
    chain.push({ name: `gemini:${m}`, run: (s, h, msg) => callGemini(g, m, s, h, msg) });

  const q = process.env.GROQ_API_KEY;
  if (q) for (const m of list(process.env.GROQ_MODELS, ["llama-3.3-70b-versatile"]))
    chain.push({ name: `groq:${m}`, run: (s, h, msg) =>
      callOpenAICompat("https://api.groq.com/openai/v1/chat/completions", q, m, s, h, msg) });

  const o = process.env.OPENROUTER_API_KEY;
  if (o) for (const m of list(process.env.OPENROUTER_MODELS, ["meta-llama/llama-3.3-70b-instruct:free"]))
    chain.push({ name: `openrouter:${m}`, run: (s, h, msg) =>
      callOpenAICompat("https://openrouter.ai/api/v1/chat/completions", o, m, s, h, msg) });
  return chain;
}

// A model that just failed is skipped for a while so replies stay fast.
const cooldownUntil = new Map();
const cooldownFor = (status) => ([401, 403, 404].includes(status) ? 10 * 60_000 : 60_000);

export async function generate(system, history, message) {
  const chain = buildChain();
  if (!chain.length) throw new Error("No AI keys set. Add GEMINI_API_KEY (and optionally GROQ_API_KEY / OPENROUTER_API_KEY).");

  const errors = [];
  for (let round = 0; round < 2; round++) {
    const now = Date.now();
    // first round skips cooling-down models; second round tries everything
    const candidates = round === 0 ? chain.filter((p) => (cooldownUntil.get(p.name) || 0) <= now) : chain;
    for (const p of candidates) {
      try {
        const text = await p.run(system, history, message);
        cooldownUntil.delete(p.name);
        return { text, via: p.name };
      } catch (e) {
        errors.push(`${p.name}: ${e.status || ""} ${String(e.message).slice(0, 120)}`);
        cooldownUntil.set(p.name, Date.now() + cooldownFor(e.status));
        console.warn(`[llm] ${p.name} failed -> trying next:`, e.message?.slice(0, 160));
      }
    }
    if (round === 0) await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("All models failed. " + errors.slice(-4).join(" | "));
}
