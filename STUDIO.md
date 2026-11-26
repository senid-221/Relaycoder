# Relay Coder Studio

Relay Coder now includes professional task-aware engineering skills and a local development workspace.

## Run locally

Requires Node.js 18 or newer.

1. Clone the repository and install dependencies (there are currently no third-party runtime dependencies):
   `git clone https://github.com/senid-221/Relaycoder.git`
   `cd Relaycoder`
2. Set a private agent access key in your terminal:
   - macOS/Linux: `export RELAY_AGENT_ACCESS_KEY="use-a-long-random-secret"`
   - Windows PowerShell: `$env:RELAY_AGENT_ACCESS_KEY="use-a-long-random-secret"`
3. Start Relay:
   `npm start`
4. Open `http://localhost:8787`. The server binds to `127.0.0.1` by default so the local terminal API is not exposed to other devices on your network. Only change `HOST` deliberately if you understand the network exposure.
5. In Preferences, enter the same agent access key. In Providers, save an API key for the model provider you want to use.

## Studio capabilities

- Separate local workspace per Relay project, stored under `.relay-workspaces/<project-id>/`.
- File listing, reading, and writing from the Studio page.
- HTML live preview in a sandboxed iframe.
- A local command runner with a strict allowlist: `npm test`, `npm install`, `npm ci`, declared `npm run <script>`, `node <file>`, `python <file>`, and read-only `git status/diff/log`.
- The Studio "Build with Relay" action lets the AI inspect and edit workspace files and run supported tests/build scripts.

## Important security and deployment notes

- The terminal and local workspace agent are enabled only by the local `server.js` process. They are not enabled in the hosted Vercel API.
- Vercel deployments do not provide a persistent project workspace or an isolated cloud shell here. The hosted Studio endpoint explicitly reports that cloud execution is not configured.
- Commands run with the permissions of the local user who started Relay. Only use this local runner with projects and dependencies you trust.
- The command runner does not invoke a shell and rejects shell operators. Script execution is limited to files inside the active workspace.
- HTML preview is supported directly. React/Next.js/Expo/Flutter projects can be edited and their declared npm scripts can be invoked, but browser/device emulators and app-store builds are not included.
- This workspace is local to one machine and is not synced to Vercel or other devices.
- Figma editing, Android/iOS emulators, and remote cloud sandbox execution require separate integrations and credentials.
