const { runAgent } = require("../lib/agent");
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  try { return res.status(200).json(await runAgent(req.body || {})); }
  catch (e) { return res.status(502).json({ error: e.message }); }
};