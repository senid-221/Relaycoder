const crypto = require("crypto");
const cloud = require("../lib/cloud-sandbox");
function authorized(key) {
  const expected = process.env.RELAY_AGENT_ACCESS_KEY || "";
  if (!expected || typeof key !== "string") return false;
  const a = Buffer.from(key), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  const body = req.body || {};
  if (!authorized(body.accessKey)) return res.status(401).json({ error: "Workspace access denied. Enter the coding agent access key in Preferences." });
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(body.projectId || "") || !/^[A-Za-z0-9_-]{16,80}$/.test(body.workspaceOwnerId || "")) {
    return res.status(400).json({ error: "Invalid project workspace identity. Refresh Relay and try again." });
  }
  const { projectId, workspaceOwnerId, accessKey } = body;
  try {
    let result;
    if (body.action === "list") result = { files: await cloud.listFiles(projectId, workspaceOwnerId, accessKey) };
    else if (body.action === "read") result = { content: await cloud.readFile(projectId, workspaceOwnerId, accessKey, body.path) };
    else if (body.action === "write") result = await cloud.writeFile(projectId, workspaceOwnerId, accessKey, body.path, body.content);
    else if (body.action === "run") result = await cloud.terminal(projectId, workspaceOwnerId, accessKey, body.command, body.args || [], body.cwd);
    else if (body.action === "preview") result = await cloud.startPreview(projectId, workspaceOwnerId, accessKey, body.command, body.args || [], body.port, body.cwd);
    else if (body.action === "stop") result = await cloud.stop(projectId, workspaceOwnerId, accessKey);
    else if (body.action === "status") {
      const sandbox = await cloud.getSandbox(projectId, workspaceOwnerId, accessKey);
      result = { ready: true, name: sandbox.name, ports: cloud.PORTS };
    } else throw new Error("Unsupported cloud workspace action.");
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    const message = e && e.message || "Cloud workspace operation failed.";
    const status = /timeout|timed out|aborted/i.test(message) ? 504 : 400;
    return res.status(status).json({ error: message });
  }
};
