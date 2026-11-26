// Local dev server: node server.js  (same API as the Vercel functions)
process.env.ALLOW_SERVER_KEYS = process.env.ALLOW_SERVER_KEYS || "true";
const http = require("http"), fs = require("fs"), path = require("path");
const { health, chat, models } = require("./lib/providers");
const { runAgent } = require("./lib/agent");
const workspace = require("./lib/workspace");
const PORT = process.env.PORT || 8787;
const send = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise((ok, no) => {
  let d = ""; req.on("data", c => { d += c; if (d.length > 5e6) req.destroy(); });
  req.on("end", () => { try { ok(JSON.parse(d || "{}")); } catch (e) { no(e); } }); req.on("error", no);
});
http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(fs.readFileSync(path.join(__dirname, "public", "index.html")));
    }
    if (req.url === "/api/health") return send(res, 200, health());
    if (req.method === "POST" && req.url === "/api/workspace") {
      const body = await readBody(req), id = body.projectId;
      try {
        let result;
        if (body.action === "list") result = { files: await workspace.listFiles(id) };
        else if (body.action === "read") result = { content: await workspace.readFile(id, body.path) };
        else if (body.action === "write") result = await workspace.writeFile(id, body.path, body.content);
        else if (body.action === "run") result = await workspace.terminal(id, body.command, body.args || []);
        else throw new Error("Unsupported workspace action.");
        return send(res, 200, { ok: true, ...result });
      } catch (e) { return send(res, 400, { error: e.message || "Workspace operation failed." }); }
    }
    if (req.method === "POST" && req.url === "/api/chat") { const [c, b] = await chat(await readBody(req)); return send(res, c, b); }
    if (req.method === "POST" && req.url === "/api/models") { const [c, b] = await models(await readBody(req)); return send(res, c, b); }
    if (req.method === "POST" && req.url === "/api/agent") return send(res, 200, await runAgent(await readBody(req)));
    send(res, 404, { error: "Not found" });
  } catch (e) { send(res, 502, { error: e.message }); }
}).listen(PORT, () => console.log("Relay running at http://localhost:" + PORT));
