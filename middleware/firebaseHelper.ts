import firebaseAdmin from 'firebase-admin';
import { DateTime } from 'luxon';
import { CourseDocument, CourseModel } from '../models/course';
import logger from './logger';
import nodeSchedule from 'node-schedule';
import mongoose from 'mongoose';

async function shutdown() {
  try {
    await nodeSchedule.gracefulShutdown();
  } catch (_: unknown) {
    // do nothing
  }
}

async function setupNotifications() {
  try {
    await nodeSchedule.gracefulShutdown();
    logger.info('[Setup] Cancelled all push notification jobs.');
    const courses = await CourseModel.find().exec();
    if (courses) {
      for (let course of courses) {
        scheduleJobsForCourseScheduledQuizzes(course);
      }
    }
  } catch (err: unknown) {
    logger.error(
      'Failed to cancel all push notification jobs or to fetch courses: ' + err
    );
  }
}

async function refreshCourseNotifications(courseId: mongoose.Types.ObjectId) {
  logger.info('Refresh push notifications for course ' + courseId);
  for (const [key, _] of Object.entries(nodeSchedule.scheduledJobs)) {
    if (key.includes(courseId.toString())) {
      nodeSchedule.cancelJob(key);
    }
  }
  try {
    const course = await CourseModel.findById(courseId).exec();
    if (course) {
      scheduleJobsForCourseScheduledQuizzes(course);
    }
  } catch (err: unknown) {
    logger.error(
      `Failed to refresh course notifications for course ${courseId}: ${err}`
    );
  }
}

async function scheduleJobsForCourseScheduledQuizzes(course: CourseDocument) {
  if (!course || !Array.isArray(course.sessions)) return;

  const currentDate = DateTime.now().setZone('utc');
  for (const session of course.sessions) {
    if (!session || !Array.isArray(session.scheduledQuizzes)) continue;
    for (const scheduledQuizPlain of session.scheduledQuizzes) {
      const start = scheduledQuizPlain.startDateTime
        ? new Date(scheduledQuizPlain.startDateTime)
        : null;
      if (!start) continue;

      const scheduledQuizStartDateTime = DateTime.fromJSDate(start, {
        zone: 'utc',
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
          `[Course: ${course._id}] Scheduling push notification for scheduled quiz ${scheduledQuizId} at ${start.toUTCString()} of session ${session.title}`
        );

        nodeSchedule.scheduleJob(jobName, start, async function () {
          try {
            logger.info(
              `Sending push notification for scheduled quiz ${scheduledQuizId} at ${start.toUTCString()}`
            );

            // Limit max length to 100 characters
            const body =
              session.title && session.title.length > 0
                ? `A quiz is available to play for '${session.title}'!`.replace(
                    /(.{100})..+/,
                    '$1…'
                  )
                : 'A quiz is available to play!';

            const message = {
              data: {
                type: 'notification',
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
              logger.info(`Successfully sent push notification: ${response}`);
            } catch (err: unknown) {
              logger.error(`Error sending message: ${err}`);
            }
          } catch (err: unknown) {
            logger.error(
              `Unhandled error in scheduled push job ${jobName}: ${err}`
            );
          }
        });
      } catch (err: unknown) {
        logger.error(
          `Failed to schedule push notification job ${jobName}: ${err}`
        );
      }
    }
  }
}

export default { shutdown, setupNotifications, refreshCourseNotifications };
