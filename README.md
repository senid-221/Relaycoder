# Relay-Coder

Relay is an AI coding agent UI that works with models from Nvidia, OpenAI, Alibaba Cloud and Anthropic.

- Chat with a model selector, file attachments, connectors, voice input
- Pages: Chat, Models, Providers, History, Preferences
- A small server proxies requests to each provider (no CORS problems, keys never leave your server and browser)

## Run locally
```bash
npm start        # Node 18+, no dependencies
# open http://localhost:8787
```

## Deploy on Vercel
1. Import this repo at https://vercel.com/new (Framework preset: Other, no build command).
2. Deploy. `public/` is served as the site and `api/*.js` become serverless functions.
3. Open the site, go to **Providers** and paste your API keys (stored in your browser only).

Optional: to use keys stored on the server, set `ALLOW_SERVER_KEYS=true` plus the provider keys
(see `.env.example`) in Vercel project settings. Only do this for a private deployment, because
anyone who can open the site would spend your keys.

## Structure
```
public/index.html   the app
api/                Vercel functions: health, chat, models
lib/providers.js    provider adapters (OpenAI-style + Anthropic)
server.js           local dev server
```
