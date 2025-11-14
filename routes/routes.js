const express = require("express");
const userActions = require("../methods/userActions");
const router = express.Router();
const otherActions = require("../methods/otherActions");
const androidOriginalActions = require("../methods/data/androidOriginalActions");
const multer = require("multer");
const upload = multer();

router.get("/", (req, res) => {
  res.send("Project Elpis ('BEACON Q').");
});

router.get("/privacy-policy.html", (req, res) => {
  // eslint-disable-next-line no-undef
  res.sendFile("privacy-policy.html", { root: __dirname });
});

//@desc Adding new user
//@route POST /register
router.post("/user/register", userActions.register);

//@desc Authenticate a user
//@route POST /authenticate
router.post("/user/authenticate", userActions.authenticate);

//@desc Retrieve the given user's secret question
//@route GET /secretQuestion:username
router.get("/user/secretQuestions/:username", userActions.getSecretQuestions);
router.post("/user/updatePassword", userActions.updatePassword);

// Send feedback without authentication
router.post(
  "/log/noAuthentication/appFeedback",
  upload.any(),
  otherActions.sendAppFeedback,
);

// Android original actions
router.get(
  "/android/latestAndroidVersionDetails",
  androidOriginalActions.getLatestAndroidVersionDetails,
);
// router.get(
//   "/android/latestAPKDetails",
//   androidOriginalActions.getLatestAndroidAPKDetails,
// );
// router.get(
//   "/android/newPlayStoreListingDetails",
//   androidOriginalActions.getNewPlayStoreListingDetails,
// );

module.exports = router;
