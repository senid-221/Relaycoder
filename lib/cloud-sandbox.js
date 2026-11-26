// Persistent Vercel Sandbox workspaces. All untrusted project code runs inside
// an isolated Firecracker microVM; application secrets are never copied into it.
const crypto = require("crypto");
const path = require("path").posix;
const ROOT = "/vercel/sandbox";
const PORTS = [3000, 4173, 5173, 8000, 8080];
const validId = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value);
function workspaceName(projectId, ownerId, secret) {
  if (!validId(projectId) || !validId(ownerId)) throw new Error("Invalid workspace identity.");
  return "relay-" + crypto.createHmac("sha256", secret).update(ownerId + ":" + projectId).digest("hex").slice(0, 32);
}
function safePath(relative) {
  if (typeof relative !== "string" || !relative.trim() || relative.includes("\\") || path.isAbsolute(relative)) throw new Error("Invalid workspace file path.");
  const normalized = path.normalize(relative);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized.split("/").includes("..")) throw new Error("File path escapes this workspace.");
  return path.join(ROOT, normalized);
}
async function getSandbox(projectId, ownerId, secret) {
  if (!process.env.VERCEL) throw new Error("Vercel Sandbox is available in the deployed Vercel environment.");
  if (!secret) throw new Error("Set RELAY_AGENT_ACCESS_KEY in Vercel Environment Variables.");
  const { Sandbox } = await import("@vercel/sandbox");
  return Sandbox.getOrCreate({
    name: workspaceName(projectId, ownerId, secret),
    persistent: true,
    timeout: 10 * 60 * 1000,
    snapshotExpiration: 7 * 24 * 60 * 60 * 1000,
    keepLastSnapshots: { count: 2 },
    resources: { vcpus: 2 },
    ports: PORTS,
    networkPolicy: "allow-all",
    onCreate: async sandbox => {
      await sandbox.writeFiles([{ path: ROOT + "/README.md", content: Buffer.from("# Relay Coder Cloud Workspace\n\nFiles in this directory belong to this project workspace.\n") }]);
    }
  });
}
async function listFiles(projectId, ownerId, secret) {
  const sandbox = await getSandbox(projectId, ownerId, secret);
  const result = await sandbox.runCommand("find", [ROOT, "-maxdepth", "7", "-type", "f",
    "-not", "-path", ROOT + "/node_modules/*",
    "-not", "-path", ROOT + "/.git/*",
    "-not", "-path", ROOT + "/.next/*",
    "-not", "-path", ROOT + "/dist/*",
    "-not", "-path", ROOT + "/build/*",
    "-not", "-path", ROOT + "/.venv/*",
    "-printf", "%P\\n"]);
  if (result.exitCode !== 0) throw new Error((await result.stderr()).slice(0, 3000) || "Could not list workspace files.");
  return (await result.stdout()).split("\n").filter(Boolean).slice(0, 500).sort();
}
async function readFile(projectId, ownerId, secret, relative) {
  const file = safePath(relative), sandbox = await getSandbox(projectId, ownerId, secret);
  const stat = await sandbox.fs.stat(file);
  if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error("File is missing, not a regular file, or larger than 1 MB.");
  return (await sandbox.readFileToBuffer({ path: file })).toString("utf8");
}
async function writeFile(projectId, ownerId, secret, relative, content) {
  const file = safePath(relative), sandbox = await getSandbox(projectId, ownerId, secret);
  if (typeof content !== "string" || Buffer.byteLength(content, "utf8") > 1024 * 1024) throw new Error("File content must be text smaller than 1 MB.");
  await sandbox.mkDir(path.dirname(file));
  await sandbox.writeFiles([{ path: file, content: Buffer.from(content, "utf8") }]);
  return { path: relative, bytes: Buffer.byteLength(content, "utf8") };
}

async function importGitHubRepository(projectId, ownerId, secret, repository, branch) {
  if (typeof repository !== "string" || !/^[A-Za-z0-9_.-]{1,100}\\/[A-Za-z0-9_.-]{1,100}$/.test(repository)) {
    throw new Error("Repository must use owner/repository format.");
  }
  if (typeof branch !== "string" || !/^[A-Za-z0-9._/-]{1,200}$/.test(branch) || branch.includes("..") || branch.startsWith("/") || branch.endsWith("/")) {
    throw new Error("Invalid Git branch name.");
  }
  const sandbox = await getSandbox(projectId, ownerId, secret);
  const existing = await listFiles(projectId, ownerId, secret);
  const userFiles = existing.filter(file => file !== "README.md");
  if (userFiles.length) throw new Error("This workspace already contains project files. Create a new Relay project before importing a repository.");
  const token = process.env.GITHUB_TOKEN || "";
  const apiUrl = "https://api.github.com/repos/" + repository.split("/").map(encodeURIComponent).join("/") + "/tarball/" + encodeURIComponent(branch);
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Relay-Coder" };
  if (token) headers.Authorization = "Bearer " + token;
  const archiveResponse = await fetch(apiUrl, { headers, redirect: "manual", signal: AbortSignal.timeout(25000) });
  let downloadResponse = archiveResponse;
  if (archiveResponse.status >= 300 && archiveResponse.status < 400) {
    const location = archiveResponse.headers.get("location");
    if (!location) throw new Error("GitHub did not provide a repository archive download URL.");
    const target = new URL(location);
    if (target.hostname !== "codeload.github.com" || target.protocol !== "https:") throw new Error("GitHub returned an unexpected archive host.");
    downloadResponse = await fetch(target.toString(), { signal: AbortSignal.timeout(25000) });
  }
  if (!downloadResponse.ok) {
    if (downloadResponse.status === 404) throw new Error("Repository or branch not found. For private repositories, configure GITHUB_TOKEN in Vercel.");
    if (downloadResponse.status === 401 || downloadResponse.status === 403) throw new Error("GitHub access denied. Check that GITHUB_TOKEN can read this repository.");
    throw new Error("GitHub archive download failed (HTTP " + downloadResponse.status + ").");
  }
  const declaredSize = Number(downloadResponse.headers.get("content-length") || 0);
  if (declaredSize > 20 * 1024 * 1024) throw new Error("Repository archive exceeds the 20 MB import limit.");
  const archive = Buffer.from(await downloadResponse.arrayBuffer());
  if (!archive.length || archive.length > 20 * 1024 * 1024) throw new Error("Repository archive is empty or exceeds the 20 MB import limit.");
  const archivePath = ROOT + "/.relay-import.tar.gz";
  await sandbox.writeFiles([{ path: archivePath, content: archive }]);
  const extracted = await sandbox.runCommand({
    cmd: "tar",
    args: ["-xzf", archivePath, "--strip-components=1", "--no-same-owner", "--no-same-permissions", "-C", ROOT],
    cwd: ROOT,
    signal: AbortSignal.timeout(25000)
  });
  await sandbox.runCommand({ cmd: "rm", args: ["-f", archivePath], cwd: ROOT }).catch(() => {});
  if (extracted.exitCode !== 0) throw new Error("Could not extract GitHub repository: " + (await extracted.stderr()).slice(0, 2500));
  const files = await listFiles(projectId, ownerId, secret);
  return { repository, branch, importedFiles: files.length, files: files.slice(0, 500) };
}

function validateCommand(command, args) {
  if (typeof command !== "string" || !/^[A-Za-z0-9._+-]{1,80}$/.test(command)) throw new Error("Invalid terminal command.");
  if (!Array.isArray(args) || args.length > 60 || args.some(x => typeof x !== "string" || x.length > 1000 || x.includes("\0"))) throw new Error("Invalid terminal arguments.");
}
async function terminal(projectId, ownerId, secret, command, args, cwd) {
  validateCommand(command, args);
  const sandbox = await getSandbox(projectId, ownerId, secret);
  const workingDirectory = cwd && cwd !== "." ? safePath(cwd) : ROOT;
  const result = await sandbox.runCommand({
    cmd: command,
    args,
    cwd: workingDirectory,
    signal: AbortSignal.timeout(45000)
  });
  return {
    code: result.exitCode,
    stdout: (await result.stdout()).slice(0, 100000),
    stderr: (await result.stderr()).slice(0, 30000)
  };
}
async function startPreview(projectId, ownerId, secret, command, args, port, cwd) {
  validateCommand(command, args);
  if (!PORTS.includes(Number(port))) throw new Error("Choose a supported preview port: " + PORTS.join(", ") + ".");
  const sandbox = await getSandbox(projectId, ownerId, secret);
  await sandbox.extendTimeout(10 * 60 * 1000);
  const workingDirectory = cwd && cwd !== "." ? safePath(cwd) : ROOT;
  const process = await sandbox.runCommand({ cmd: command, args, cwd: workingDirectory, detached: true });
  return { previewUrl: sandbox.domain(Number(port)), port: Number(port), commandId: process.id || null };
}
async function stop(projectId, ownerId, secret) {
  const sandbox = await getSandbox(projectId, ownerId, secret);
  const result = await sandbox.stop();
  return { stopped: true, snapshotId: result.snapshot && result.snapshot.id || null };
}
module.exports = { getSandbox, listFiles, readFile, writeFile, terminal, startPreview, importGitHubRepository, stop, PORTS };
