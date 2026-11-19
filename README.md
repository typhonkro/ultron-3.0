# ULTRON

Personal AI assistant: Node backend + Next.js dashboard, Supabase DB, Gemini brain.

## Setup (about 10 minutes)

1. **Supabase**: open SQL Editor, paste `supabase/schema.sql`, Run.
2. **Push this folder to GitHub.**
3. **Render**: New > Blueprint > pick the repo. It reads `render.yaml` and creates two free services.
4. Set environment variables in Render:
   - Backend: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GEMINI_API_KEY`, `ULTRON_ADMIN_KEY` (any long secret you invent), `FRONTEND_URL` (the dashboard's Render URL).
   - Dashboard: `NEXT_PUBLIC_API_URL` (the backend's Render URL). Redeploy the dashboard after setting it.
5. Open the dashboard URL, enter your `ULTRON_ADMIN_KEY`, and chat.

## Run locally

```
cd backend && cp .env.example .env && npm install && npm run dev
cd frontend && cp .env.example .env.local && npm install && npm run dev
```

## How the toggles work

Settings live in the `ultron_settings` table. `backend/brain.js` builds ULTRON's instructions from them on every message, so a toggle takes effect on the next reply.

`chat()` in `brain.js` is the single entry point. WhatsApp (Phase 4) and Instagram (Phase 5) will call the same function.

Notes: Render's free backend sleeps after inactivity, so the first message can take about 50 seconds.
