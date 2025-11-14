const process = require("process");

var functions = {
  isUserAdmin: function (userId, adminPassword) {
    if (
      userId.toString() != process.env.ADMIN_USER_ID ||
      adminPassword.toString() != process.env.ADMIN_PASSWORD
    ) {
      return false;
    }
    return true;
  },
};

module.exports = functions;
