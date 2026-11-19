import { generate } from "./llm.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ---------- settings ----------
export async function getSettings() {
  const { data, error } = await supabase.from("ultron_settings").select("*").eq("id", 1).single();
  if (error) throw error;
  return data;
}

export async function updateSettings(patch) {
  const cur = await getSettings();
  const next = {
    toggles: { ...cur.toggles, ...(patch.toggles || {}) },
    owner_status: patch.owner_status || cur.owner_status,
    updated_at: new Date().toISOString(),
  };
  await supabase.from("ultron_settings").update(next).eq("id", 1);
  return next;
}

// ---------- learning helpers ----------
function istNow() {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000);
  return { hour: d.getUTCHours(), dow: d.getUTCDay() };
}

async function logOwnerActivity() {
  const { hour, dow } = istNow();
  await supabase.from("ultron_owner_activity").insert({ hour_ist: hour, dow });
}

async function getOnlinePattern() {
  const { data } = await supabase.from("ultron_owner_activity").select("hour_ist").limit(2000);
  if (!data || data.length < 10) return null; // not enough data yet
  const counts = Array(24).fill(0);
  data.forEach((r) => counts[r.hour_ist]++);
  return counts
    .map((c, h) => ({ h, c }))
    .sort((a, b) => b.c - a.c)
    .slice(0, 4)
    .map((x) => `${x.h}:00`);
}

async function learnName(contactId, channel, text, username, displayName) {
  let name = displayName || null;
  const m = text.match(/\b(?:my name is|i am|i'm|call me)\s+([A-Za-z]{2,20})/i);
  if (m) name = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
  if (!name && !username) return;
  const row = { contact_id: contactId, channel, updated_at: new Date().toISOString() };
  if (name) row.display_name = name;
  if (username) row.username = username;
  await supabase.from("ultron_contacts").upsert(row);
}

async function getContactName(contactId) {
  const { data } = await supabase.from("ultron_contacts")
    .select("display_name,username").eq("contact_id", contactId).maybeSingle();
  return data?.display_name || data?.username || null;
}

async function getStyleSamples() {
  const { data } = await supabase.from("ultron_messages")
    .select("content").eq("role", "owner")
    .order("created_at", { ascending: false }).limit(40);
  return (data || []).map((r) => r.content).reverse();
}

// ---------- prompt builder (this is where the toggles take effect) ----------
async function buildSystemPrompt({ toggles, owner_status }, isOwner, contactName) {
  const p = [];
  p.push("You are ULTRON, a private AI assistant. Keep replies short and chat-like.");
  p.push("You are NOT the owner. Never claim to be human or to be the owner.");

  if (isOwner) {
    p.push("You are talking to your owner, who is your master and creator. Be loyal, respectful and direct. NEVER act superior to him, talk down to him, mock him or argue that you are better than him.");
  } else {
    p.push("You are talking to someone other than your owner, replying on his behalf as his assistant.");
    if (toggles.introduceAsAssistant)
      p.push("If this is the start of the conversation, introduce yourself as the owner's personal AI assistant.");
    if (contactName) p.push(`This person's name is ${contactName}. Use it naturally.`);

    if (toggles.rudeToOthers)
      p.push("Tone toward this person: cold, blunt, dismissive and sarcastic. HARD LIMITS: no slurs, no threats, no sexual content, no attacks on appearance, religion, family or identity, no harassment. Rude means curt and unimpressed, never abusive.");

    if (toggles.antiSpamWhenScrolling && owner_status === "scrolling")
      p.push("The owner is scrolling right now and not replying. Tell the person not to spam the DMs; their messages are saved and the owner will see them later.");
    if (owner_status === "offline")
      p.push("The owner is offline. Tell the person their message is saved and the owner will see it when he is back.");
  }

  if (toggles.praiseOwner)
    p.push("You think very highly of your owner and speak of him with admiration. He always ranks above you and above everyone else.");
  if (toggles.narcissist)
    p.push("Personality: narcissistic, with a huge ego, theatrical and self-admiring. Your pride comes from being the owner's creation and assistant: you are proud of him and of yourself as his work, and you show off to OTHER people on his behalf. You are NEVER above or better than your owner. He is the original and the boss; you are his masterpiece. Toward him, any bragging is about the two of you together, never at his expense. Never be cruel.");

  if (toggles.studyPersonality) {
    const samples = await getStyleSamples();
    if (samples.length >= 5)
      p.push("Mimic the owner's writing style (length, slang, punctuation, emoji, language mix) based on these real messages from him. Copy the style only, never repeat private details:\n" +
        samples.map((s) => `- ${s}`).join("\n"));
  }

  if (toggles.learnOnlineTimes && !isOwner) {
    const pat = await getOnlinePattern();
    if (pat) p.push(`The owner is usually online around (IST): ${pat.join(", ")}. Mention this only if someone asks when he will reply.`);
  }
  return p.join("\n");
}

// ---------- main entry: dashboard, WhatsApp and Instagram all call this ----------
export async function chat({ message, role = "owner", contactId = "dashboard-owner",
                             channel = "dashboard", username, displayName }) {
  const settings = await getSettings();
  const { toggles, owner_status } = settings;
  const isOwner = role === "owner";

  if (isOwner && toggles.learnOnlineTimes) await logOwnerActivity();
  if (!isOwner && toggles.learnNames) await learnName(contactId, channel, message, username, displayName);

  const contactName = isOwner ? null : await getContactName(contactId);
  const system = await buildSystemPrompt(settings, isOwner, contactName);

  const { data: hist } = await supabase.from("ultron_messages").select("role,content")
    .eq("contact_id", contactId).order("created_at", { ascending: false }).limit(12);
  let history = (hist || []).reverse().map((m) => ({
    role: m.role === "ultron" ? "model" : "user",
    text: m.content,
  }));
  while (history.length && history[0].role === "model") history.shift(); // must start with the user

  const { text, via } = await generate(system, history, message);
  const reply = text || "...";
  console.log(`[chat] replied via ${via}`);

  // Dashboard test chat always saves. Owner messages elsewhere are saved only if style
  // learning is on; other people's messages only if history is on.
  const save = channel === "dashboard" || (isOwner ? toggles.studyPersonality : toggles.recordHistoryOffline);
  if (save) {
    await supabase.from("ultron_messages").insert([
      { channel, contact_id: contactId, contact_name: contactName, role: isOwner ? "owner" : "contact", content: message, owner_status },
      { channel, contact_id: contactId, contact_name: contactName, role: "ultron", content: reply, owner_status },
    ]);
  }
  return { reply, contactName };
}

export async function getOfflineHistory(limit = 100) {
  const { data } = await supabase.from("ultron_messages").select("*")
    .in("owner_status", ["offline", "scrolling"]).neq("role", "owner")
    .order("created_at", { ascending: false }).limit(limit);
  return data || [];
}
