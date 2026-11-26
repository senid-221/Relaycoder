const { chat } = require("../lib/providers");
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  try {
    const [code, body] = await chat(req.body || {});
    res.status(code).json(body);
  } catch (e) { res.status(502).json({ error: e.message }); }
};
