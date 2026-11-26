# Relay Coder Studio

Relay Coder supports a persistent, isolated cloud development workspace through Vercel Sandbox.

## Deploy on Vercel

1. Connect this repository to a Vercel project and deploy it with the Node.js runtime set to **Node.js 24.x** (the Sandbox SDK requires Node.js 22.19 or newer).
2. In Vercel → Project → Settings → Environment Variables, set:
   - `RELAY_AGENT_ACCESS_KEY`: a long, private random value. Use the same value in Relay → Preferences → Coding agent access key.
   - Keep your AI provider API key in Relay → Providers or in server-side environment variables. The provider key is used by the Relay API and is never copied into the sandbox.
3. Ensure Vercel Sandbox / OIDC is enabled for the Vercel project. In production, the Sandbox SDK uses the Vercel OIDC identity automatically; no Vercel access token should be placed in browser storage.
4. Redeploy after changing environment variables.
5. Open Relay → Projects, select a project, then open **Studio**. Enter the agent access key in Preferences. Studio creates that project's cloud workspace on first use.

## Cloud workspace capabilities

- A persistent Vercel Sandbox is assigned to each browser workspace + Relay project.
- Firecracker microVM isolation for project code and shell commands.
- Workspace files are snapshotted and restored when the sandbox resumes. Snapshot retention is configured for seven days, keeping the last two snapshots.
- File listing, reading, and writing from Studio.
- Real Linux terminal commands, including npm, pnpm, bun, node, Python, git and framework build/test commands. Commands run directly (no implicit shell); use `bash -lc` only when a shell script is deliberately required.
- The AI agent can inspect and edit workspace files and run actual tests/build commands through the sandbox.
- Preview servers can be started on ports 3000, 4173, 5173, 8000, or 8080. The returned `vercel.run` URL is a bearer-style preview link; treat it as private.
- Default sandbox image includes Node.js, Python, Git and common development utilities.

## Security and operating limits

- Project code runs inside a separate microVM, not in the Relay API process.
- Do not put provider API keys, GitHub tokens, database passwords, or other production secrets in project files or sandbox environment variables. Relay does not pass its server environment into the sandbox.
- The sandbox has outbound network access so dependency installation and Git operations can work. Review untrusted code and package lifecycle scripts before running them.
- Workspace identity is derived server-side from the access key plus a random browser workspace ID and project ID. The access key must remain private.
- Sandbox sessions use two vCPUs, a ten-minute session timeout, and seven-day snapshot expiration. Vercel plan quotas and billing apply; stop/delete workspaces when they are no longer needed.
- Vercel function requests are currently limited by the configured 60-second function duration. Very long builds may need a future background-job/queue workflow.
- Browser/device emulators, app-store signing, Figma account editing, and remote mobile-device testing are not included by this integration.

## Local development

Requires Node.js 22.19 or newer for the installed Sandbox SDK.

```bash
git clone https://github.com/senid-221/Relaycoder.git
cd Relaycoder
npm install
```

Set the access key:
- macOS/Linux: `export RELAY_AGENT_ACCESS_KEY="use-a-long-random-secret"`
- Windows PowerShell: `$env:RELAY_AGENT_ACCESS_KEY="use-a-long-random-secret"`

Then run:
```bash
npm start
```

Open `http://localhost:8787`. The local `server.js` uses its existing filesystem workspace and strict local command allowlist. Vercel Sandbox cloud execution is provided by the deployed Vercel API and its OIDC identity.
