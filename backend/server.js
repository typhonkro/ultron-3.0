import "dotenv/config";
import express from "express";
import cors from "cors";
import { chat, getSettings, updateSettings, getOfflineHistory } from "./brain.js";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));

// Only you can use the API: the dashboard sends your admin key
function requireOwner(req, res, next) {
  if (!process.env.ULTRON_ADMIN_KEY || req.headers["x-ultron-key"] !== process.env.ULTRON_ADMIN_KEY)
    return res.status(401).json({ error: "Wrong admin key" });
  next();
}

app.get("/", (_, res) => res.send("ULTRON online"));
app.get("/health", (_, res) => res.json({ ok: true }));

app.post("/api/chat", requireOwner, async (req, res) => {
  try {
    const { message, role, displayName } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: "Empty message" });
    const isOwner = role !== "contact";
    const out = await chat({
      message: message.trim(),
      role: isOwner ? "owner" : "contact",
      contactId: isOwner ? "dashboard-owner" : "dashboard-test-stranger",
      displayName,
    });
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Brain failed: " + (e.message || "unknown") });
  }
});

app.get("/api/settings", requireOwner, async (_, res) => {
  try { res.json(await getSettings()); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/settings", requireOwner, async (req, res) => {
  try { res.json(await updateSettings(req.body)); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/api/history", requireOwner, async (_, res) => {
  try { res.json(await getOfflineHistory()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(process.env.PORT || 4000, () => console.log("ULTRON backend running"));
