const { health } = require("../lib/providers");
module.exports = (req, res) => res.status(200).json(health());
