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

## Live GitHub coding agent

Enable the GitHub connector in Relay chat to let the selected model inspect repository files, stage edits, and commit/push changes. Configure these server-side environment variables in Vercel (Project Settings → Environment Variables), then redeploy:

- `GITHUB_TOKEN`: a fine-grained GitHub token with **Contents: Read and write** access to the target repository.
- `GITHUB_REPO`: target in `owner/repository` format, for example `senid-221/Relaycoder`.
- `GITHUB_BRANCH`: base branch for Relay feature branches and Pull Requests (optional; defaults to `main`).
- `RELAY_AGENT_ACCESS_KEY`: a separate long random password used to authorize Relay users to run GitHub changes. Enter the same value in Relay → Preferences. Do not reuse your GitHub token.

Keep `GITHUB_TOKEN` and `RELAY_AGENT_ACCESS_KEY` private and never put them in source code. The agent reads the base branch, stages changes, creates a dedicated `relay/...` feature branch, commits and pushes changes, then opens a draft Pull Request. It never pushes task changes directly to the base branch. GitHub Actions runs `npm test` for each Pull Request. Direct GitHub mode has no shell/terminal, so Relay cannot run tests before pushing; it reports remote CI as pending.

## Structure
```
public/index.html   the app
api/                Vercel functions: health, chat, models
lib/providers.js    provider adapters (OpenAI-style + Anthropic)
server.js           local dev server
```
