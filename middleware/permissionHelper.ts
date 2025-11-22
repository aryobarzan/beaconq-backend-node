import process from "process";

var functions = {
  isUserAdmin: function (userId: string, adminPassword: string) {
    if (!process.env.ADMIN_USER_ID || !process.env.ADMIN_PASSWORD) {
      return false;
    }
    if (
      userId !== process.env.ADMIN_USER_ID ||
      adminPassword !== process.env.ADMIN_PASSWORD
    ) {
      return false;
    }
    return true;
  },
};

export default functions;
