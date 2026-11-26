// Local-only project workspace. Never exposed by the hosted Vercel API.
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const runFile = promisify(execFile);
const ROOT = path.join(__dirname, "..", ".relay-workspaces");
const idOK = id => typeof id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(id);
function baseFor(id) {
  if (!idOK(id)) throw new Error("Invalid workspace ID.");
  return path.join(ROOT, id);
}
function safeFile(base, rel) {
  if (typeof rel !== "string" || !rel.trim() || rel.includes("\\") || path.isAbsolute(rel)) throw new Error("Invalid file path.");
  const full = path.resolve(base, rel);
  if (!full.startsWith(base + path.sep)) throw new Error("File path escapes this workspace.");
  return full;
}
async function listFiles(id) {
  const base = baseFor(id); await fs.promises.mkdir(base, { recursive: true });
  const out = [];
  async function walk(dir, prefix, depth) {
    if (depth > 5 || out.length >= 300) return;
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name.startsWith(".") || ["node_modules","dist","build",".git"].includes(ent.name)) continue;
      const rel = prefix ? prefix + "/" + ent.name : ent.name;
      if (ent.isSymbolicLink()) continue;
      if (ent.isDirectory()) await walk(path.join(dir, ent.name), rel, depth + 1);
      else if (ent.isFile()) out.push(rel);
      if (out.length >= 300) break;
    }
  }
  await walk(base, "", 0); return out.sort();
}
async function readFile(id, rel) {
  const base = baseFor(id), full = safeFile(base, rel);
  const stat = await fs.promises.stat(full);
  if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error("File is missing, not a regular file, or larger than 1 MB.");
  return await fs.promises.readFile(full, "utf8");
}
async function writeFile(id, rel, content) {
  const base = baseFor(id), full = safeFile(base, rel);
  if (typeof content !== "string" || Buffer.byteLength(content, "utf8") > 1024 * 1024) throw new Error("File content must be text smaller than 1 MB.");
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  const parent = await fs.promises.realpath(path.dirname(full));
  if (!parent.startsWith(await fs.promises.realpath(base) + path.sep) && parent !== await fs.promises.realpath(base)) throw new Error("Invalid workspace directory.");
  await fs.promises.writeFile(full, content, "utf8");
  return { path: rel, bytes: Buffer.byteLength(content, "utf8") };
}
function validateCommand(command, args, base) {
  if (!Array.isArray(args) || args.length > 30 || args.some(x => typeof x !== "string" || x.length > 300 || /[;&|\x60\n\r]/.test(x))) throw new Error("Invalid command arguments. Shell operators are not supported.");
  if (command === "npm" && ["test","install","ci","run"].includes(args[0])) {
    if (args[0] === "run") {
      const pkgPath = path.join(base, "package.json");
      if (!fs.existsSync(pkgPath)) throw new Error("No package.json exists in this workspace.");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      const script = args[1];
      if (!script || !pkg.scripts || !pkg.scripts[script]) throw new Error("That npm script is not defined in package.json.");
      if (args.length > 2 && args[2] !== "--") throw new Error("Use npm run <script> -- <script arguments>.");
    }
    return;
  }
  if (command === "node" && args.length && !args[0].startsWith("-")) return;
  if (command === "python" && args.length && !args[0].startsWith("-")) return;
  if (command === "git" && ["status","diff","log"].includes(args[0])) return;
  throw new Error("Command not allowed. Supported: npm test, npm install, npm ci, npm run <script>, node <file>, python <file>, git status/diff/log.");
}
async function terminal(id, command, args) {
  const base = baseFor(id); await fs.promises.mkdir(base, { recursive: true });
  validateCommand(command, args, base);
  try {
    const result = await runFile(command, args, { cwd: base, timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true, env: { ...process.env, CI: "true", FORCE_COLOR: "0" } });
    return { code: 0, stdout: result.stdout || "", stderr: result.stderr || "" };
  } catch (e) {
    return { code: Number.isInteger(e.code) ? e.code : 1, stdout: e.stdout || "", stderr: e.stderr || e.message || "Command failed." };
  }
}
module.exports = { listFiles, readFile, writeFile, terminal };
