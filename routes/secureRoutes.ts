import express from 'express';
import courseAnnouncementActions from '../methods/data/courseAnnouncementActions';
import courseActions from '../methods/data/courseActions';
import topicActions from '../methods/data/topicActions';
import courseSessionActions from '../methods/data/courseSessionActions';
import quizActions from '../methods/data/quizActions';
import activityActions from '../methods/data/activityActions';
import fsrsActions from '../methods/data/fsrsActions';
import ebisuActions from '../methods/data/ebisuActions';
import playActions from '../methods/playActions';
import userActivityLogActions from '../methods/userLog/activityLogActions';
import userOtherLogActions from '../methods/userLog/otherLogActions';
import imageActions from '../methods/imageActions';
import updateActions from '../methods/data/updateActions';
import otherActions from '../methods/otherActions';
import userActions from '../methods/userActions';
import teacherActions from '../methods/teacherActions';
import statsActions from '../methods/statsActions';
import syncActions from '../methods/syncActions';
import adminActions from '../methods/adminActions';
import achievementActions from '../methods/data/achievementActions';
import patronActions from '../methods/data/patronActions';
import multer from 'multer';
const router = express.Router();
const upload = multer();

// ============================================================
// Activity Routes
// ============================================================

/**
 * @swagger
 * /activities:
 *   post:
 *     summary: Create or update an activity
 *     tags: [Activities, Teacher Only]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - activity
 *             properties:
 *               activity:
 *                 $ref: '#/components/schemas/Activity'
 *     responses:
 *       200:
 *         description: Activity created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - activity
 *               properties:
 *                 activity:
 *                   $ref: '#/components/schemas/Activity'
 *       209:
 *         description: Activity updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - activity
 *               properties:
 *                 activity:
 *                   $ref: '#/components/schemas/Activity'
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Internal server error
 */
router.post('/activities', activityActions.createOrUpdateActivity);
/**
 * @swagger
 * /activities:
 *   get:
 *     summary: Get all activities created by the authenticated teacher
 *     tags: [Activities, Teacher Only]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Activities retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - activities
 *               properties:
 *                 activities:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Activity'
 *       209:
 *         description: No activities found
 *       500:
 *         description: Internal server error
 */
router.get('/activities', activityActions.getActivities);

// ============================================================
// Quiz Routes
// ============================================================

/**
 * @swagger
 * /quizzes:
 *   post:
 *     summary: Create or update a quiz
 *     tags: [Quizzes, Teacher Only]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quiz
 *             properties:
 *               quiz:
 *                 $ref: '#/components/schemas/Quiz'
 *     responses:
 *       200:
 *         description: Quiz created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - quiz
 *               properties:
 *                 quiz:
 *                   $ref: '#/components/schemas/Quiz'
 *       209:
 *         description: Quiz updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - quiz
 *               properties:
 *                 quiz:
 *                   $ref: '#/components/schemas/Quiz'
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Internal server error
 */
router.post('/quizzes', quizActions.createOrUpdateQuiz);

/**
 * @swagger
 * /quizzes:
 *   get:
 *     summary: Get all quizzes created by the authenticated teacher
 *     tags: [Quizzes, Teacher Only]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Quizzes retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - quizzes
 *               properties:
 *                 quizzes:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Quiz'
 *       209:
 *         description: No quizzes found
 *       500:
 *         description: Internal server error
 */
router.get('/quizzes', quizActions.getQuizzes);

// ============================================================
// Topic Routes
// ============================================================

/**
 * @swagger
 * /topics:
 *   post:
 *     summary: Create or update a topic
 *     tags: [Topics, Teacher Only]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - topic
 *             properties:
 *               topic:
 *                 $ref: '#/components/schemas/Topic'
 *     responses:
 *       200:
 *         description: Topic created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - topic
 *               properties:
 *                 topic:
 *                   $ref: '#/components/schemas/Topic'
 *       209:
 *         description: Topic updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - topic
 *               properties:
 *                 topic:
 *                   $ref: '#/components/schemas/Topic'
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Internal server error
 */
router.post('/topics', topicActions.createOrUpdateTopic);

/**
 * @swagger
 * /topics:
 *   get:
 *     summary: Get all topics created by the authenticated teacher
 *     tags: [Topics, Teacher Only]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Topics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - topics
 *               properties:
 *                 topics:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Topic'
 *       209:
 *         description: No topics found
 *       500:
 *         description: Internal server error
 */
router.get('/topics', topicActions.getTopics);

/**
 * @swagger
 * /topic/rate:
 *   post:
 *     summary: Rate a topic
 *     tags: [Topics]
 *     security:
 *       - bearerAuth: []
 *     deprecated: true
 *     responses:
 *       200:
 *         description: Topic rated successfully
 */
router.post('/topic/rate', topicActions.rateTopic);

/**
 * @swagger
 * /topic/:topicId/ratings{:courseSessionId}:
 *   get:
 *     summary: Get topic ratings for course session's topic
 *     tags: [Topics]
 *     security:
 *       - bearerAuth: []
 *     deprecated: true
 *     responses:
 *       200:
 *         description: Topic ratings retrieved successfully
 */
router.get(
  '/topic/:topicId/ratings{:courseSessionId}',
  topicActions.getTopicRatings
);

/**
 * @swagger
 * /topics/ratings:
 *   post:
 *     summary: Get all ratings for a topic
 *     tags: [Topics]
 *     security:
 *       - bearerAuth: []
 *     deprecated: true
 *     responses:
 *       200:
 *         description: Topic ratings retrieved successfully
 */
router.post('/topics/ratings', topicActions.getTopicsRatings);

// ============================================================
// FSRS Routes
// ============================================================

/**
 * @swagger
 * /fsrsModels:
 *   post:
 *     summary: Store or update FSRS models of the user
 *     tags: [FSRS]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fsrsModels
 *             properties:
 *               fsrsModels:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/FSRSModel'
 *     responses:
 *       200:
 *         description: FSRS models stored successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - fsrsModels
 *               properties:
 *                 fsrsModels:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/FSRSModel'
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Internal server error
 */
router.post('/fsrsModels', fsrsActions.storeFSRSModels);

// ============================================================
// Ebisu Routes
// ============================================================

/**
 * @swagger
 * /ebisuModels:
 *   post:
 *     summary: Store or update Ebisu models of the user
 *     tags: [Ebisu]
 *     security:
 *       - bearerAuth: []
 *     deprecated: true
 *     responses:
 *       200:
 *         description: Ebisu models stored successfully
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Internal server error
 */
router.post('/ebisuModels', ebisuActions.storeEbisuModels);

// ============================================================
// Course Routes
// ============================================================

/**
 * @swagger
 * /courses:
 *   post:
 *     summary: Create or update a course
 *     tags: [Courses, Teacher Only]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - course
 *             properties:
 *               course:
 *                 $ref: '#/components/schemas/Course'
 *     responses:
 *       200:
 *         description: Course created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - course
 *               properties:
 *                 course:
 *                   $ref: '#/components/schemas/Course'
 *       209:
 *         description: Course updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - course
 *               properties:
 *                 course:
 *                   $ref: '#/components/schemas/Course'
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Internal server error
 */
router.post('/courses', courseActions.createOrUpdateCourse);
/**
 * @swagger
 * /courses:
 *   get:
 *     summary: Get all courses created by the authenticated teacher
 *     tags: [Courses, Teacher Only]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Courses retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - courses
 *               properties:
 *                 courses:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Course'
 *       209:
 *         description: No courses found
 *       500:
 *         description: Internal server error
 */
router.get('/courses', courseActions.getCourses);
/**
 * @swagger
 * /courses/registered{:metadataOnly}:
 *   get:
 *     summary: Get all courses the authenticated user is registered to
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: metadataOnly
 *         required: false
 *         schema:
 *           type: boolean
 *         description: If true, only return metadata without full course details, e.g., scheduled quizzes do not include the quiz details (activities). (default: false)
 *     responses:
 *       200:
 *         description: Courses retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - courses
 *               properties:
 *                 courses:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Course'
 *       209:
 *         description: No courses found
 *       500:
 *         description: Internal server error
 */
router.get(
  '/courses/registered{:metadataOnly}',
  courseActions.getRegisteredCoursesForUser
);
/**
 * @swagger
 * /course/register:
 *   post:
 *     summary: Register the authenticated user to a course
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accessKey
 *             properties:
 *               accessKey:
 *                 type: string
 *                 description: The access key of the course to register to
 *     responses:
 *       200:
 *         description: Course registered successfully
 *       209:
 *         description: Course already registered
 *       400:
 *         description: Invalid input
 *       452:
 *         description: Invalid access key
 *       453:
 *         description: Course registration limit reached
 *       500:
 *         description: Internal server error
 */
router.post('/course/register', courseActions.registerToCourse);
/**
 * @swagger
 * /course/unregister:
 *   post:
 *     summary: Unregister the authenticated user from a course
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - courseId
 *             properties:
 *               courseId:
 *                 type: string
 *                 description: The ID of the course to unregister from
 *     responses:
 *       200:
 *         description: Course unregistered successfully
 *       209:
 *         description: Course not registered
 *       400:
 *         description: Invalid input
 *       452:
 *         description: Invalid course ID
 *       500:
 *         description: Internal server error
 */
router.post('/course/unregister', courseActions.deregisterFromCourse);
/**
 * @swagger
 * /courses/demo:
 *   get:
 *     summary: Get the access key for the demo course
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Demo course access key retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - accessKey
 *               properties:
 *                 accessKey:
 *                   type: string
 *                   description: The access key of the demo course
 *       500:
 *         description: Internal server error
 */
router.get('/courses/demo', courseActions.getDemoCourseAccessKey);
/**
 * @swagger
 * /course/:courseId/registeredUsers:
 *   get:
 *     summary: Get the registered users for a course
 *     tags: [Courses, Teacher Only]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the course to get registered users for
 *     responses:
 *       200:
 *         description: Registered users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       209:
 *         description: No registered users found
 *       400:
 *         description: Invalid input
 *       452:
 *         description: Invalid course ID
 *       500:
 *         description: Internal server error
 */
router.get(
  '/course/:courseId/registeredUsers',
  courseActions.getUserRegistrationsForCourse
);

// ============================================================
// Course Announcement Routes
// ============================================================

/**
 * @swagger
 * /courseAnnouncements:
 *   post:
 *     summary: Create or update a course announcement
 *     tags: [Course Announcements, Teacher Only]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - courseAnnouncement
 *             properties:
 *               courseAnnouncement:
 *                 $ref: '#/components/schemas/CourseAnnouncement'
 *     responses:
 *       200:
 *         description: Course announcement created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - courseAnnouncement
 *               properties:
 *                 courseAnnouncement:
 *                   $ref: '#/components/schemas/CourseAnnouncement'
 *       209:
 *         description: Course announcement updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - courseAnnouncement
 *               properties:
 *                 courseAnnouncement:
 *                   $ref: '#/components/schemas/CourseAnnouncement'
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Internal server error
 */
router.post(
  '/courseAnnouncements',
  courseAnnouncementActions.createOrUpdateCourseAnnouncement
);
/**
 * @swagger
 * /courseAnnouncements/:courseId:
 *   get:
 *     summary: Get course announcements for a course
 *     tags: [Course Announcements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the course to get course announcements for
 *     responses:
 *       200:
 *         description: Course announcements retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/CourseAnnouncement'
 *       209:
 *         description: No course announcements found
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Internal server error
 */
router.get(
  '/courseAnnouncements/:courseId',
  courseAnnouncementActions.getCourseAnnouncements
);
/**
 * @swagger
 * /courseAnnouncements:
 *   get:
 *     summary: Get course announcements for courses
 *     tags: [Course Announcements]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - courseIds
 *             properties:
 *               courseIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: The IDs of the courses to get course announcements for
 *     responses:
 *       200:
 *         description: Course announcements retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/CourseAnnouncement'
 *       209:
 *         description: No course announcements found
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Internal server error
 */
router.get(
  '/courseAnnouncements/',
  courseAnnouncementActions.getCourseAnnouncementsForCourses
);

// ============================================================
// Image Routes
// ============================================================

router.post('/images/upload', imageActions.uploadImages);
router.get('/image/download/', imageActions.downloadImage);
router.post('/images/delete/', imageActions.deleteImages);

// ============================================================
// Gallery Image Routes
// ============================================================

router.post('/gallery/images', imageActions.uploadGalleryImage);
router.get('/gallery/images/:imageId', imageActions.downloadGalleryImage);
router.get(
  '/gallery/imageIdentifiers',
  imageActions.getGalleryImageIdentifiers
);
router.delete('/gallery/images', imageActions.deleteGalleryImages);

// ============================================================
// Play Routes
// ============================================================

/**
 * @swagger
 * /play/scheduledQuiz:
 *   post:
 *     summary: Play a scheduled quiz. Used to track the exact timestamp when the user has started playing a scheduled quiz, which will be used to compute the remaining time for finishing the quiz.
 *     tags: [Play]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - scheduledQuizId
 *             properties:
 *               scheduledQuizId:
 *                 type: string
 *                 description: The ID of the scheduled quiz to play
 *               timestamp:
 *                 type: string
 *                 format: date-time (ISO)
 *                 description: The client timestamp when the user started playing the scheduled quiz
 *     responses:
 *       200:
 *         description: Started / can continue scheduled quiz
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 status:
 *                   type: string
 *                   description: The status of the scheduled quiz (canPlay, canContinue)
 *                 availablePlayTime:
 *                   type: number
 *                   description: The available play time for the scheduled quiz in microseconds
 *                 activities:
 *                   type: array
 *                   items:
 *                     type: string
 *                     description: The IDs of the activities of the scheduled quiz which remain to be played.
 *                 availableSurveyQuestions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SurveyQuestion'
 *                     description: The survey questions of the scheduled quiz. (only if status is canContinue)
 *       209:
 *         description: Already played all activities of the scheduled quiz
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 status:
 *                   type: string
 *                   description: The status of the scheduled quiz (hasFinished)
 *                 availableSurveyQuestions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SurveyQuestion'
 *                     description: The survey questions of the scheduled quiz.
 *       210:
 *         description: Scheduled quiz not yet available
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 status:
 *                   type: string
 *                   description: The status of the scheduled quiz (notAvailable)
 *                 availableSurveyQuestions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SurveyQuestion'
 *                     description: The survey questions of the scheduled quiz.
 *       400:
 *         description: Missing scheduledQuizId or timestamp
 *       452:
 *         description: Invalid scheduledQuizId
 *       453:
 *         description: Play period over
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 status:
 *                   type: string
 *                   description: The status of the scheduled quiz (isOver)
 *                 availableSurveyQuestions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SurveyQuestion'
 *                     description: The survey questions of the scheduled quiz.
 *       500:
 *         description: Internal server error
 */
router.post('/play/scheduledQuiz', playActions.playScheduledQuiz);

/**
 * @swagger
 * /play/logActivityUserAnswer:
 *   post:
 *     summary: Log a user answer for an activity.
 *     tags: [Play]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - activityUserAnswer
 *             properties:
 *               activityUserAnswer:
 *                 $ref: '#/components/schemas/ActivityUserAnswer'
 *     responses:
 *       200:
 *         description: Activity user answer logged successfully
 *       209:
 *         description: Activity user answer already logged
 *       400:
 *         description: Missing activityUserAnswer
 *       452:
 *         description: Invalid scheduledQuizId in activityUserAnswer
 *       455:
 *         description: Invalid activityUserAnswer
 *       500:
 *         description: Internal server error
 */
router.post(
  '/play/logActivityUserAnswer',
  userActivityLogActions.logActivityUserAnswer
);

/**
 * @swagger
 * /play/logActivityUserAnswers:
 *   post:
 *     summary: Log multiple activity user answers.
 *     tags: [Play]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - activityUserAnswers
 *             properties:
 *               activityUserAnswers:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/ActivityUserAnswer'
 *     responses:
 *       200:
 *         description: Activity user answers logged successfully
 *       400:
 *         description: Missing activityUserAnswers
 *       452:
 *         description: Nothing to log.
 *       500:
 *         description: Internal server error
 */
router.post(
  '/play/logActivityUserAnswers',
  userActivityLogActions.logActivityUserAnswers
);

/**
 * @swagger
 * /play/scheduledQuizzes:
 *   get:
 *     summary: Get the user's status for all scheduled quizzes of their actively registered courses.
 *     tags: [Play]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The user's status for all scheduled quizzes of their actively registered courses retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statuses:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       isOld:
 *                         type: boolean
 *                         description: Whether the scheduled quiz is older than 4 months.
 *                       err:
 *                         type: string
 *                         description: The error message.
 *                       quizStatus:
 *                         type: string
 *                         description: The status of the scheduled quiz.
 *                       availableActivities:
 *                         type: array
 *                         items:
 *                           type: string
 *                         description: The IDS of the activities of the scheduled quiz.
 *                       availablePlayTime:
 *                         type: string
 *                         description: The play time (microseconds) of the scheduled quiz.
 *                       availableSurveyQuestions:
 *                         type: array
 *                         items:
 *                           $ref: '#/components/schemas/SurveyQuestion'
 *                         description: The survey questions of the scheduled quiz.
 *                       scheduledQuizId:
 *                         type: string
 *                         description: The ID of the scheduled quiz.
 *       209:
 *         description: No registered courses
 *       500:
 *         description: Internal server error
 */
router.get('/play/scheduledQuizzes', playActions.checkScheduledQuizzes);
router.get(
  '/play/scheduledQuiz/:scheduledQuizId/',
  playActions.checkScheduledQuizSurveyStatus
);
router.get('/play/trialQuiz/:courseId', playActions.checkTrialQuizPlayStatus);

// ============================================================
// Course Session Routes
// ============================================================

router.post(
  '/course/session/topicIndex',
  courseSessionActions.updateCurrentSessionTopic
);
router.get(
  '/course/session/:sessionId/topicIndex',
  courseSessionActions.getCurrentSessionTopicIndex
);
router.get(
  '/course/session/:sessionId/active',
  courseSessionActions.isSessionActive
);

// ============================================================
// Update Routes
// ============================================================

// Updates
// Note: up until and including client version 5.3.1 of BEACON Q,
// the client used the method POST. All later versions migrated to GET instead.
// For backwards compatibility reasons, retain the POST variants of these 4
// update endpoints, though they can be eventually removed by the time 6.0.0 releases.
router.post('/updates/courses', updateActions.checkForCourseUpdates);
router.post('/updates/quizzes', updateActions.checkForQuizUpdates);
router.post('/updates/activities', updateActions.checkForActivityUpdates);
router.post('/updates/topics', updateActions.checkForTopicUpdates);
router.get('/updates/courses', updateActions.checkForCourseUpdates);
router.get('/updates/quizzes', updateActions.checkForQuizUpdates);
router.get('/updates/activities', updateActions.checkForActivityUpdates);
router.get('/updates/topics', updateActions.checkForTopicUpdates);

// ============================================================
// Logging Routes
// ============================================================

router.post(
  '/log/activityUserInteraction',
  userActivityLogActions.logActivityUserInteraction
);
router.post(
  '/log/activityFeedbackView',
  userActivityLogActions.logActivityFeedbackView
);
router.post('/log/appInteraction', userOtherLogActions.logAppInteraction);
router.post(
  '/log/appUserInteraction',
  userOtherLogActions.logAppUserInteraction
);
router.post('/log/surveyAnswer', userOtherLogActions.logSurveyAnswer);
router.post('/log/playContext', userOtherLogActions.logPlayContext);

// ============================================================
// Feedback Routes
// ============================================================

router.get('/feedback/api', otherActions.getFeedbackAPIDetails);
router.post('/log/appFeedback', upload.any(), otherActions.sendAppFeedback);
router.get('/log/appFeedback', otherActions.getAppFeedback);

// ============================================================
// Apollo Routes
// ============================================================

router.get('/apollo/api', otherActions.getOpenAIAPIDetails);

// ============================================================
// Statistics Routes
// ============================================================

router.post('/stats/scheduledQuizzes', statsActions.getLogsForScheduledQuizzes);
router.get(
  '/stats/surveyAnswers/:scheduledQuizId',
  statsActions.getSurveyAnswersForScheduledQuiz
);
router.get('/stats/trialQuiz/:courseId', statsActions.getTrialQuizAnswers);
router.get(
  '/stats/activityUserAnswers/:courseId',
  statsActions.getActivityUserAnswers
);

// ============================================================
// Synchronization Routes
// ============================================================

router.post('/sync/fsrsModels', syncActions.syncFSRSModels);
router.post('/sync/ebisuModels', syncActions.syncEbisuModels);
router.post('/sync/activityUserAnswers', syncActions.syncActivityUserAnswers);
router.get(
  '/sync/activityUserAnswersByTimestamp',
  syncActions.checkActivityUserAnswersLoggingByTimestamp
);

// ============================================================
// User Routes
// ============================================================

router.get('/user/isTokenValid', userActions.isTokenValid);
router.post('/user/delete', userActions.deleteAccount);
router.post('/user/secretQuestion', userActions.addSecretQuestion);
router.post('/user/secretQuestion/verify', userActions.verifySecretQuestion);
router.post(
  '/user/updatePassword/verified',
  userActions.updatePasswordAuthenticated
);

// ============================================================
// Admin Routes
// ============================================================

router.get(
  '/admin/authenticate/:adminPassword',
  adminActions.authenticateAdmin
);
router.get('/admin/users/:adminPassword', adminActions.getUsers);
router.post('/admin/changeUserPassword', adminActions.changeUserPassword);

// ============================================================
// Achievements Routes
// ============================================================

router.post('/achievements', achievementActions.createAchievements);
router.get('/achievements', achievementActions.getAchievements);
router.get('/userAchievements', achievementActions.getUserAchievements);
router.put('/userAchievements', achievementActions.updateUserAchievements);

// ============================================================
// Patrons Routes
// ============================================================

router.patch(
  '/userPatronProfile/:course',
  patronActions.updateUserPatronProfile
);
router.get('/userPatronProfile/:course', patronActions.getUserPatronProfile);
// Express v4 -> v5 migration: regex no longer supported: instead of /:course?, use {/:course}
router.get(
  '/userPatronProfiles{/:course}',
  patronActions.getUserPatronProfiles
);
router.get(
  '/coursePatronProfiles/:course',
  patronActions.getCoursePatronProfiles
);

// ============================================================
// DEPRECATED Routes
// ============================================================
/// DEPRECATED - replaced by /topic/rate
// router.post("/course/topic/rate", courseSessionActions.rateSessionTopic);
/// DEPRECATED - replaced by /topic/:topicId/ratings:courseSessionId?
// router.get(
//   "/course/session/:sessionId/topicRatings",
//   courseSessionActions.getSessionTopicRatings
// );
// DEPRECATED
router.post('/manage/resetAnswers', teacherActions.resetTeacherAnswers);

export default router;
