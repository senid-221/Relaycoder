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
module.exports = { getSandbox, listFiles, readFile, writeFile, terminal, startPreview, stop, PORTS };
