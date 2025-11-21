import express from "express";
import courseAnnouncementActions from "../methods/data/courseAnnouncementActions";
import courseActions from "../methods/data/courseActions";
import topicActions from "../methods/data/topicActions";
import courseSessionActions from "../methods/data/courseSessionActions";
import quizActions from "../methods/data/quizActions";
import activityActions from "../methods/data/activityActions";
import fsrsActions from "../methods/data/fsrsActions";
import ebisuActions from "../methods/data/ebisuActions";
import playActions from "../methods/playActions";
import imageActions from "../methods/imageActions";
import updateActions from "../methods/data/updateActions";
import otherActions from "../methods/otherActions";
import userActions from "../methods/userActions";
import teacherActions from "../methods/teacherActions";
import statsActions from "../methods/statsActions";
import syncActions from "../methods/syncActions";
import adminActions from "../methods/adminActions";
import achievementActions from "../methods/data/achievementActions";
import patronActions from "../methods/data/patronActions";
import multer from "multer";
import e from "express";
const router = express.Router();
const upload = multer();

router.post("/activities", activityActions.createOrUpdateActivity);
router.get("/activities", activityActions.getActivities);

router.post("/quizzes", quizActions.createOrUpdateQuiz);
router.get("/quizzes", quizActions.getQuizzes);

router.post("/topics", topicActions.createOrUpdateTopic);
router.get("/topics", topicActions.getTopics);
router.post("/topic/rate", topicActions.rateTopic);
router.get(
  "/topic/:topicId/ratings{:courseSessionId}",
  topicActions.getTopicRatings,
);
router.post("/topics/ratings", topicActions.getTopicsRatings);

router.post("/fsrsModels", fsrsActions.storeFSRSModels);

router.post("/ebisuModels", ebisuActions.storeEbisuModels);

router.post("/courses", courseActions.createOrUpdateCourse);
router.get("/courses", courseActions.getCourses);
router.get(
  "/courses/registered{:metadataOnly}",
  courseActions.getRegisteredCoursesForUser,
);
router.post("/course/register", courseActions.registerToCourse);
router.post("/course/unregister", courseActions.deregisterFromCourse);
router.get("/courses/demo", courseActions.getDemoCourseAccessKey);
router.get(
  "/course/:courseId/registeredUsers",
  courseActions.getUserRegistrationsForCourse,
);

router.post(
  "/courseAnnouncements",
  courseAnnouncementActions.createOrUpdateCourseAnnouncement,
);
router.get(
  "/courseAnnouncements/:courseId",
  courseAnnouncementActions.getCourseAnnouncements,
);
router.get(
  "/courseAnnouncements/",
  courseAnnouncementActions.getCourseAnnouncementsForCourses,
);

// TODO: To be deprecated
router.post("/manage/resetAnswers", teacherActions.resetTeacherAnswers);

// Upload & download files
router.post("/images/upload", imageActions.uploadImages);
router.get("/image/download/", imageActions.downloadImage);
router.post("/images/delete/", imageActions.deleteImages);

// Upload & download gallery images
router.post("/gallery/images", imageActions.uploadGalleryImage);
router.get("/gallery/images/:imageId", imageActions.downloadGalleryImage);
router.get(
  "/gallery/imageIdentifiers",
  imageActions.getGalleryImageIdentifiers,
);
router.delete("/gallery/images", imageActions.deleteGalleryImages);

// Play
router.post("/play/scheduledQuiz", playActions.playScheduledQuiz);
router.post("/play/logActivityUserAnswer", playActions.logActivityUserAnswer);
router.post("/play/logActivityUserAnswers", playActions.logActivityUserAnswers);
router.get("/play/scheduledQuizzes", playActions.checkScheduledQuizzes);
router.get(
  "/play/scheduledQuiz/:scheduledQuizId/",
  playActions.checkScheduledQuizSurveyStatus,
);
router.get("/play/trialQuiz/:courseId", playActions.checkTrialQuizPlayStatus);

// Course Topics
/// DEPRECATED - replaced by /topic/rate
// router.post("/course/topic/rate", courseSessionActions.rateSessionTopic);
/// DEPRECATED - replaced by /topic/:topicId/ratings:courseSessionId?
// router.get(
//   "/course/session/:sessionId/topicRatings",
//   courseSessionActions.getSessionTopicRatings
// );
router.post(
  "/course/session/topicIndex",
  courseSessionActions.updateCurrentSessionTopic,
);
router.get(
  "/course/session/:sessionId/topicIndex",
  courseSessionActions.getCurrentSessionTopicIndex,
);
router.get(
  "/course/session/:sessionId/active",
  courseSessionActions.isSessionActive,
);

// Updates
// Note: up until and including client version 5.3.1 of BEACON Q,
// the client uses the method POST. All later versions migrated to GET instead.
// For backwards compatibility reasons, retain the POST variants of these 4
// update endpoints, though they can be eventually removed by the time 6.0.0 releases.
router.post("/updates/courses", updateActions.checkForCourseUpdates);
router.post("/updates/quizzes", updateActions.checkForQuizUpdates);
router.post("/updates/activities", updateActions.checkForActivityUpdates);
router.post("/updates/topics", updateActions.checkForTopicUpdates);
router.get("/updates/courses", updateActions.checkForCourseUpdates);
router.get("/updates/quizzes", updateActions.checkForQuizUpdates);
router.get("/updates/activities", updateActions.checkForActivityUpdates);
router.get("/updates/topics", updateActions.checkForTopicUpdates);

// Logging
router.post(
  "/log/activityUserInteraction",
  playActions.logActivityUserInteraction,
);
router.post("/log/activityFeedbackView", playActions.logActivityFeedbackView);
router.post("/log/appInteraction", playActions.logAppInteraction);
router.post("/log/appUserInteraction", playActions.logAppUserInteraction);
router.post("/log/surveyAnswer", playActions.logSurveyAnswer);
router.post("/log/playContext", playActions.logPlayContext);

// Feedback
router.get("/feedback/api", otherActions.getFeedbackAPIDetails);
router.post("/log/appFeedback", upload.any(), otherActions.sendAppFeedback);
router.get("/log/appFeedback", otherActions.getAppFeedback);

// Apollo
router.get("/apollo/api", otherActions.getOpenAIAPIDetails);

// Statistics
router.post("/stats/scheduledQuizzes", statsActions.getLogsForScheduledQuizzes);
router.get(
  "/stats/surveyAnswers/:scheduledQuizId",
  statsActions.getSurveyAnswersForScheduledQuiz,
);
router.get("/stats/trialQuiz/:courseId", statsActions.getTrialQuizAnswers);
router.get(
  "/stats/activityUserAnswers/:courseId",
  statsActions.getActivityUserAnswers,
);

// Synchronization
router.post("/sync/fsrsModels", syncActions.syncFSRSModels);
router.post("/sync/ebisuModels", syncActions.syncEbisuModels);
router.post("/sync/activityUserAnswers", syncActions.syncActivityUserAnswers);
router.get(
  "/sync/activityUserAnswersByTimestamp",
  syncActions.checkActivityUserAnswersLoggingByTimestamp,
);
// router.get(
//   "/sync/activityUserAnswersByIds",
//   playActions.getActivityUsersAnswersByIds,
// );
//@desc Authenticate a user
//@route POST /authenticate
router.get("/user/isTokenValid", userActions.isTokenValid);
router.post("/user/delete", userActions.deleteAccount);
router.post("/user/secretQuestion", userActions.addSecretQuestion);
router.post("/user/secretQuestion/verify", userActions.verifySecretQuestion);
router.post(
  "/user/updatePassword/verified",
  userActions.updatePasswordAuthenticated,
);

// Admin
router.get(
  "/admin/authenticate/:adminPassword",
  adminActions.authenticateAdmin,
);
router.get("/admin/users/:adminPassword", adminActions.getUsers);
router.post("/admin/changeUserPassword", adminActions.changeUserPassword);

// Achievements
router.post("/achievements", achievementActions.createAchievements);
router.get("/achievements", achievementActions.getAchievements);
router.get("/userAchievements", achievementActions.getUserAchievements);
router.put("/userAchievements", achievementActions.updateUserAchievements);

// Patrons
router.patch(
  "/userPatronProfile/:course",
  patronActions.updateUserPatronProfile,
);
router.get("/userPatronProfile/:course", patronActions.getUserPatronProfile);
// Express v4 -> v5 migration: regex no longer supported: instead of /:course?, use {/:course}
router.get(
  "/userPatronProfiles{/:course}",
  patronActions.getUserPatronProfiles,
);
router.get(
  "/coursePatronProfiles/:course",
  patronActions.getCoursePatronProfiles,
);

export default router;
