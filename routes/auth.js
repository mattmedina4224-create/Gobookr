const { route } = require("../router");

module.exports = function authRoutes() {
  return route(async (req, res) => {
    res.statusCode = 404;
    res.end("Not found");
  });
};
