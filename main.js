const MSCP = require("mscp");
const path = require("path");

(async () => {
  let mscp = new MSCP({"": require("./handler.js"), "user": require("mscp-user")})
  mscp.server.static(path.join(__dirname, 'www'));
  await mscp.start();
})()
