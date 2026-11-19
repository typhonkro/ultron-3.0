"use client";
import { useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL;

const TOGGLES = [
  ["studyPersonality", "Study my personality and copy my style"],
  ["learnOnlineTimes", "Learn my patterns and when I'm online"],
  ["introduceAsAssistant", "Introduce itself as my personal AI assistant"],
  ["rudeToOthers", "Be rude to other people"],
  ["praiseOwner", "Think very highly of me"],
  ["antiSpamWhenScrolling", "Tell people not to spam my DMs while I'm scrolling"],
  ["learnNames", "Learn people's names from chats and usernames"],
  ["recordHistoryOffline", "Keep a message history while I'm offline"],
  ["narcissist", "Narcissistic personality"],
];

export default function Dashboard() {
  const [key, setKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("chat");
  const [msgs, setMsgs] = useState([]);
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [role, setRole] = useState("owner");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  const api = (path, opts = {}) =>
    fetch(`${API}${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", "x-ultron-key": key, ...(opts.headers || {}) },
    }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
      return j;
    });

  useEffect(() => {
    const saved = localStorage.getItem("ultron_key");
    if (saved) setKey(saved);
  }, []);

  useEffect(() => {
    if (!key) return;
    api("/api/settings")
      .then(setSettings)
      .catch((e) => { setError(e.message); setKey(""); localStorage.removeItem("ultron_key"); });
  }, [key]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  useEffect(() => {
    if (tab === "history" && key) api("/api/history").then(setHistory).catch((e) => setError(e.message));
  }, [tab]);

  const unlock = (e) => {
    e.preventDefault();
    localStorage.setItem("ultron_key", keyInput);
    setError("");
    setKey(keyInput);
  };

  const save = async (patch) => {
    try {
      const next = await api("/api/settings", { method: "POST", body: JSON.stringify(patch) });
      setSettings((s) => ({ ...s, ...next }));
    } catch (e) { setError(e.message); }
  };

  const send = async () => {
    if (!input.trim() || busy) return;
    const text = input.trim();
    setInput(""); setBusy(true); setError("");
    setMsgs((m) => [...m, { from: role === "owner" ? "you" : "stranger", text }]);
    try {
      const { reply } = await api("/api/chat", { method: "POST", body: JSON.stringify({ message: text, role }) });
      setMsgs((m) => [...m, { from: "ultron", text: reply }]);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  if (!key || !settings) {
    return (
      <main className="gate">
        <div className="eye" aria-hidden />
        <h1>ULTRON</h1>
        <form onSubmit={unlock}>
          <input type="password" placeholder="Admin key" value={keyInput}
                 onChange={(e) => setKeyInput(e.target.value)} autoFocus />
          <button type="submit">Unlock</button>
        </form>
        {error && <p className="err">{error}</p>}
      </main>
    );
  }

  return (
    <div className="shell">
      <aside>
        <div className="brand"><span className="eye small" aria-hidden /> ULTRON</div>

        <section>
          <h2>My status</h2>
          <div className="seg">
            {["online", "scrolling", "offline"].map((s) => (
              <button key={s} className={settings.owner_status === s ? "on" : ""}
                      onClick={() => save({ owner_status: s })}>{s}</button>
            ))}
          </div>
        </section>

        <section>
          <h2>Behaviour</h2>
          {TOGGLES.map(([k, label]) => (
            <label key={k} className="row">
              <span>{label}</span>
              <input type="checkbox" checked={!!settings.toggles[k]}
                     onChange={(e) => save({ toggles: { [k]: e.target.checked } })} />
              <i className="sw" />
            </label>
          ))}
        </section>
      </aside>

      <main className="main">
        <header>
          <div className="seg">
            <button className={tab === "chat" ? "on" : ""} onClick={() => setTab("chat")}>Test chat</button>
            <button className={tab === "history" ? "on" : ""} onClick={() => setTab("history")}>While I was away</button>
          </div>
          {tab === "chat" && (
            <div className="seg">
              <button className={role === "owner" ? "on" : ""} onClick={() => setRole("owner")}>Chat as me</button>
              <button className={role === "contact" ? "on" : ""} onClick={() => setRole("contact")}>Chat as a stranger</button>
            </div>
          )}
        </header>

        {error && <p className="err bar">{error}</p>}

        {tab === "chat" ? (
          <>
            <div className="log">
              {msgs.length === 0 && <p className="empty">Say something. Switch to "stranger" to test how ULTRON treats other people.</p>}
              {msgs.map((m, i) => (
                <div key={i} className={`bubble ${m.from === "ultron" ? "bot" : "me"}`}>{m.text}</div>
              ))}
              {busy && <div className="bubble bot thinking">thinking…</div>}
              <div ref={endRef} />
            </div>
            <div className="composer">
              <input value={input} placeholder={role === "owner" ? "Message ULTRON as yourself" : "Message ULTRON as a stranger"}
                     onChange={(e) => setInput(e.target.value)}
                     onKeyDown={(e) => e.key === "Enter" && send()} />
              <button onClick={send} disabled={busy}>Send</button>
            </div>
          </>
        ) : (
          <div className="log">
            {history.length === 0 && <p className="empty">Nothing yet. Messages from other people while your status is "scrolling" or "offline" show up here.</p>}
            {history.map((h) => (
              <div key={h.id} className="hist">
                <b>{h.role === "ultron" ? "ULTRON" : h.contact_name || h.contact_id}</b>
                <span>{new Date(h.created_at).toLocaleString()} · {h.channel} · {h.owner_status}</span>
                <p>{h.content}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
