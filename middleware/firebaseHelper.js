const firebaseAdmin = require("firebase-admin");
const { DateTime } = require("luxon");
var Course = require("../models/course");
const logger = require("./logger");
const nodeSchedule = require("node-schedule");
var mongoose = require("mongoose");

async function shutdown() {
  try {
    await nodeSchedule.gracefulShutdown();
  } catch (err) {
    // do nothing
  }
}

async function setupNotifications() {
  try {
    await nodeSchedule.gracefulShutdown();
    logger.info("[Setup] Cancelled all push notification jobs.");
    const courses = await Course.find().exec();
    if (courses) {
      for (let course of courses) {
        scheduleJobsForCourseScheduledQuizzes(course);
      }
    }
  } catch (err) {
    logger.error(
      "Failed to cancel all push notification jobs or to fetch courses: " + err,
    );
  }
}

async function refreshCourseNotifications(courseId) {
  logger.info("Refresh push notifications for course " + courseId);
  for (const [key, _] of Object.entries(nodeSchedule.scheduledJobs)) {
    if (key.includes(courseId)) {
      nodeSchedule.cancelJob(key);
    }
  }
  try {
    const course = await Course.findById(
      mongoose.Types.ObjectId(courseId),
    ).exec();
    if (course) {
      scheduleJobsForCourseScheduledQuizzes(course);
    }
  } catch (err) {
    logger.error("Failed to refresh course notifications", {
      courseId: courseId,
      err: err,
    });
  }
}

async function scheduleJobsForCourseScheduledQuizzes(course) {
  if (!course || !Array.isArray(course.sessions)) return;

  const currentDate = DateTime.now().setZone("utc");
  for (const session of course.sessions) {
    if (!session || !Array.isArray(session.scheduledQuizzes)) continue;
    for (const scheduledQuizPlain of session.scheduledQuizzes) {
      const start = scheduledQuizPlain.startDateTime
        ? new Date(scheduledQuizPlain.startDateTime)
        : null;
      if (!start) continue;

      const scheduledQuizStartDateTime = DateTime.fromJSDate(start, {
        zone: "utc",
      });

      if (scheduledQuizStartDateTime <= currentDate) continue;

      const scheduledQuizId = scheduledQuizPlain._id;
      const jobName = `Course_${course._id}_scheduledQuiz_${scheduledQuizId}`;

      // avoid duplicate jobs
      if (nodeSchedule.scheduledJobs && nodeSchedule.scheduledJobs[jobName]) {
        logger.info(`Job already scheduled: ${jobName}, skipping`);
        continue;
      }

      try {
        logger.info(
          `[Course: ${course._id}] Scheduling push notification for scheduled quiz ${scheduledQuizId} at ${start.toUTCString()} of session ${session.title}`,
        );

        nodeSchedule.scheduleJob(jobName, start, async function () {
          try {
            logger.info(
              `Sending push notification for scheduled quiz ${scheduledQuizId} at ${start.toUTCString()}`,
            );

            // Limit max length to 100 characters
            const body =
              session.title && session.title.length > 0
                ? `A quiz is available to play for '${session.title}'!`.replace(
                    /(.{100})..+/,
                    "$1…",
                  )
                : "A quiz is available to play!";

            const message = {
              data: {
                type: "notification",
                // IMPORTANT: without toString, the course'd id is Mongo's own ObjectId, which causes a FirebaseMessagingError,
                // due to its data field only expecting String-type values!
                course: course._id.toString(),
              },
              notification: {
                title: course.title,
                body: body,
              },
              topic: `Course_${course._id.toString()}`,
            };

            try {
              const response = await firebaseAdmin.messaging().send(message);
              logger.info("Successfully sent push notification:", { response });
            } catch (error) {
              logger.error("Error sending message:", { error });
            }
          } catch (err) {
            logger.error("Unhandled error in scheduled push job", {
              err,
              jobName,
            });
          }
        });
      } catch (err) {
        logger.error("Failed to schedule push notification job", {
          err,
          jobName,
        });
      }
    }
  }
}

module.exports = { shutdown, setupNotifications, refreshCourseNotifications };
