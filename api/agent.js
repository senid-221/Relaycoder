const { runAgent } = require("../lib/agent");
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });
  const send = event => res.write("data: " + JSON.stringify(event) + "\n\n");
  try {
    const result = await runAgent(req.body || {}, send);
    send({ type: "final", result });
  } catch (e) {
    send({ type: "error", error: e.message || "GitHub agent failed" });
  }
  res.end();
};