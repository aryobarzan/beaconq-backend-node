import express from 'express';
import userActions from '../methods/userActions';
import otherActions from '../methods/otherActions';
import healthActions from '../methods/healthActions';
import androidOriginalActions from '../methods/data/androidOriginalActions';
import multer from 'multer';
import {
  loginLimiter,
  accountRecoveryLimiter,
  publicWriteLimiter,
  statusLimiter,
} from '../middleware/rateLimiters';

const router = express.Router();
const upload = multer();

router.get('/', (_, res) => {
  res.send("Project Elpis ('BEACON Q').");
});

router.get('/privacy-policy.html', (_, res) => {
  res.sendFile('privacy-policy.html', { root: __dirname });
});

//@desc Public service status: reachability of the API and the database.
//      Deliberately unauthenticated, so a client can still show a status
//      screen when logins are failing because the database is down.
//@route GET /status
router.get('/status', statusLimiter, healthActions.getStatus);

//@desc Adding new user
//@route POST /register
router.post('/user/register', publicWriteLimiter, userActions.register);

//@desc Authenticate a user
//@route POST /authenticate
router.post('/user/authenticate', loginLimiter, userActions.authenticate);

//@desc Retrieve the given user's secret question
//@route GET /secretQuestion:username
router.get(
  '/user/secretQuestions/:username',
  accountRecoveryLimiter,
  userActions.getSecretQuestions
);
router.post(
  '/user/updatePassword',
  accountRecoveryLimiter,
  userActions.updatePassword
);

// Send feedback without authentication
router.post(
  '/log/noAuthentication/appFeedback',
  publicWriteLimiter,
  upload.any(),
  otherActions.sendAppFeedback
);

// Android original actions
router.get(
  '/android/latestAndroidVersionDetails',
  androidOriginalActions.getLatestAndroidVersionDetails
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
