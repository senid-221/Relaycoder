const workspace = require("../lib/workspace");
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  res.status(501).json({ error: "The project workspace and terminal are local-development features. Run Relay with npm start on your own machine; hosted cloud sandbox execution is not configured." });
};
