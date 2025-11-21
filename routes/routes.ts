import express from "express";
import userActions from "../methods/userActions";
import otherActions from "../methods/otherActions";
import androidOriginalActions from "../methods/data/androidOriginalActions";
import multer from "multer";

const router = express.Router();
const upload = multer();

router.get("/", (_, res) => {
  res.send("Project Elpis ('BEACON Q').");
});

router.get("/privacy-policy.html", (_, res) => {
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

export default router;
