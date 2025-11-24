import mongoose from "mongoose";
import ModelHelper from "../middleware/modelHelper";
import { DateTime } from "luxon";
import { SurveyAnswerModel } from "../models/logs/surveyAnswer";
import logger from "../middleware/logger";
import { ScheduledQuizDocument } from "../models/scheduledQuiz";
import { ActivityUserAnswerModel } from "../models/logs/activityUserAnswer";

const functions = {
  // Check if the user has already answered the given scheduledQuiz' (mongoose object) survey.
  // If not, compute the set of questions the user should be answering, assuming they are still within the allowed survey period.

  // Note: this function contains a lot of hard-coded questions. In recent versions, the survey questions are directly stored as part of a ScheduledQuiz document.
  // However, for backward-compatibility with older client versions, the hardcoded questions are retained.
  checkScheduledQuizSurveyUserStatus: async function (
    userId: string,
    scheduledQuiz: ScheduledQuizDocument,
  ) {
    try {
      const surveyAnswer = await SurveyAnswerModel.findOne({
        scheduledQuiz: scheduledQuiz._id,
        user: new mongoose.Types.ObjectId(userId),
      }).exec();
      // User has answered survey
      if (surveyAnswer) {
        return {
          err: null,
          questions: null,
          existingSurveyAnswer: surveyAnswer,
        };
      }

      const result = await ModelHelper.findCourseAndSession(
        scheduledQuiz._id.toString(),
      );
      if (!result || !result["course"] || !result["courseSession"]) {
        return {
          err: new Error("Course not found."),
          questions: null,
          existingSurveyAnswer: null,
        };
      }
      const quiz = await ModelHelper.findQuiz(scheduledQuiz.quiz.toString());
      if (!quiz) {
        return {
          err: new Error("Quiz not found."),
          questions: null,
          existingSurveyAnswer: null,
        };
      }
      const courseSession = result["courseSession"];
      const scheduledQuizzes = courseSession["scheduledQuizzes"];
      const currentDate = DateTime.now().setZone("utc");
      const sessionStartDateTime = DateTime.fromJSDate(
        courseSession.startDateTime,
        { zone: "utc" },
      );
      const scheduledQuizStartDateTime = DateTime.fromJSDate(
        scheduledQuiz.startDateTime,
        { zone: "utc" },
      );
      const scheduledQuizEndDateTime = DateTime.fromJSDate(
        scheduledQuiz.endDateTime,
        { zone: "utc" },
      );

      const isWithinPlayPeriod =
        scheduledQuizStartDateTime <= currentDate &&
        scheduledQuizEndDateTime > currentDate;

      const canNoLongerTakeSurvey =
        !isWithinPlayPeriod &&
        scheduledQuizEndDateTime.plus({ days: 1 }) < currentDate;
      if (canNoLongerTakeSurvey) {
        return {
          err: null,
          questions: null,
          existingSurveyAnswer: null,
        };
      }

      const isPreQuiz = scheduledQuizStartDateTime < sessionStartDateTime;
      let isFirstPostQuiz = !isPreQuiz;

      /// TODO: temporary!
      const isFinalTestQuiz = quiz.title.toLowerCase().includes("final");
      let precedingQuizAnswerPercentages = [];
      if (!isPreQuiz) {
        for (const otherScheduledQuiz of scheduledQuizzes) {
          if (
            scheduledQuiz._id.toString() === otherScheduledQuiz._id.toString()
          ) {
            continue;
          }
          const otherQuizStartDateTime = DateTime.fromJSDate(
            otherScheduledQuiz.startDateTime,
          ).setZone("utc");
          if (otherQuizStartDateTime < scheduledQuizStartDateTime) {
            isFirstPostQuiz = false;
            const userAnswers = await ActivityUserAnswerModel.find({
              scheduledQuiz: otherScheduledQuiz._id,
              user: new mongoose.Types.ObjectId(userId),
            })
              .lean()
              .exec();

            const otherQuiz = await ModelHelper.findQuiz(
              otherScheduledQuiz.quiz.toString(),
            );
            const activitiesCount =
              otherQuiz && Array.isArray(otherQuiz.activities)
                ? otherQuiz.activities.length
                : 0;

            let percentage = 0.0;
            if (userAnswers && userAnswers.length > 0 && activitiesCount > 0) {
              percentage = Math.min(1.0, userAnswers.length / activitiesCount);
            }

            precedingQuizAnswerPercentages.push({
              scheduledQuiz: otherScheduledQuiz,
              percentage: percentage,
            });
          }
        }
      }
      precedingQuizAnswerPercentages = precedingQuizAnswerPercentages.sort(
        (a, b) => {
          const aStartMs = DateTime.fromJSDate(a.scheduledQuiz.startDateTime, {
            zone: "utc",
          }).toMillis();
          const bStartMs = DateTime.fromJSDate(b.scheduledQuiz.startDateTime, {
            zone: "utc",
          }).toMillis();
          return aStartMs - bStartMs;
        },
      );
      let questions: Array<{
        question: string;
        questionType: string;
        isMultipleChoice?: boolean;
        min?: number;
        max?: number;
        choices?: Array<string>;
      }> = [
        {
          question: "How difficult did you find the quiz?",
          questionType: "numericRange",
          min: 1,
          max: 5,
        },

        // Question added as of BEACON Q 5.x.y (WS24)
        {
          question: "How educational were the questions?",
          questionType: "numericRange",
          min: 1,
          max: 5,
        },

        // Question removed as of BEACON Q 5.x.y (WS24)
        // {
        //   question:
        //     "How would you assess your current level of understanding of the overall course?",
        //   questionType: "numericRange",
        //   min: 1,
        //   max: 5,
        // },
      ];
      // Pre-quiz
      if (isPreQuiz) {
        questions.push({
          question: "How much did you prepare for this week's lecture?",
          questionType: "numericRange",
          min: 1,
          max: 5,
        });
      } else {
        // All post-quizzes
        questions.push({
          question: "How motivated were you to play this quiz?",
          questionType: "numericRange",
          min: 1,
          max: 5,
        });

        // Question removed as of BEACON Q 5.x.y (WS24)
        // questions.push({
        //   question:
        //     "How sufficient did you find the time for playing this quiz?",
        //   questionType: "numericRange",
        //   min: 1,
        //   max: 5,
        // });

        // Question added as of BEACON Q 5.x.y (WS24)
        questions.push({
          question: "How useful was the feedback after answering a question?",
          questionType: "numericRange",
          min: 1,
          max: 5,
        });
        // First post-quiz
        if (isFirstPostQuiz) {
          questions.push({
            question:
              "How much did the quiz lower your initial confidence in your understanding of the lecture's topics?",
            questionType: "numericRange",
            min: 1,
            max: 5,
          });

          // Question removed as of BEACON Q 5.x.y (WS24)
          // questions.push({
          //   question:
          //     "Will you be restudying this quiz' topics before the next lecture?",
          //   questionType: "choice",
          //   isMultipleChoice: false,
          //   choices: ["Yes", "No"],
          // });
        }
        // Subsequent post-quiz (2nd, 3rd, ...)
        else {
          let previouslyPlayedQuiz = null;
          if (precedingQuizAnswerPercentages.length > 0) {
            for (
              let k = precedingQuizAnswerPercentages.length - 1;
              k >= 0;
              k--
            ) {
              if (precedingQuizAnswerPercentages[k]["percentage"] > 0.0) {
                previouslyPlayedQuiz = precedingQuizAnswerPercentages[k];
                break;
              }
            }
          }
          // Did answer at least 1 activity from one preceding quiz
          if (previouslyPlayedQuiz) {
            questions.push({
              question:
                "How much did you restudy your lecture material after your last played quiz?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            });

            // Question removed as of BEACON Q 5.x.y (WS24)
            // questions.push({
            //   question:
            //     "How much did you adjust your studying to focus on the topics you found difficult in the previous quiz you played?",
            //   questionType: "numericRange",
            //   min: 1,
            //   max: 5,
            // });
          }
        }
      }
      if (isFinalTestQuiz) {
        // TODO: temporary
        if (
          result["course"] &&
          result["course"].title &&
          result["course"].title.toLowerCase().includes("programming 1")
        ) {
          questions = [
            {
              question:
                "How much had you already studied for your final written exam before this quiz?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
            {
              question:
                "How much did this quiz improve your confidence for your upcoming final written exam?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
            {
              question:
                "Will you be studying more for your final written exam based on your performance in this quiz?",
              questionType: "choice",
              isMultipleChoice: false,
              choices: ["Yes", "No"],
            },
            {
              question:
                "How useful was the Lighthouse for replaying quizzes and reviewing your understanding of each topic?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
            {
              question:
                "How useful was the dynamic difficulty adjustment of the quizzes?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
            {
              question:
                "How intuitive was the interface for building expressions (boolean, numeric) in the block-based code editor (DartBlock)?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
            {
              question:
                "How useful was the option to convert your block-based code to real Java code?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
            {
              question:
                "How useful was the option to execute your block-based code?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
            {
              question:
                "How useful was the option to view the exceptions thrown by your faulty block-based code?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
            {
              question:
                "How satisfied were you with the automatic evaluation of your block-based code?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
            {
              question:
                "Overall, how easy was it to compose programs through the block-based code editor?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
            {
              question:
                "How beneficial was the BEACON Q app for your studies during this semester?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
          ];
        } else if (
          result["course"] &&
          result["course"].title &&
          (result["course"].title.toLowerCase().includes("programming 2") ||
            result["course"].title.toLowerCase().includes("algorithms 3"))
        ) {
          questions = [
            {
              question:
                "How much had you already studied for your final written exam before this quiz?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
            {
              question:
                "How much did this quiz improve your confidence for your upcoming final written exam?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
            {
              question:
                "Will you be studying more for your final written exam based on your performance in this quiz?",
              questionType: "choice",
              isMultipleChoice: false,
              choices: ["Yes", "No"],
            },
            {
              question:
                "How useful was the Lighthouse for replaying quizzes and reviewing your understanding of each topic?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
            {
              question:
                "How useful was the dynamic difficulty adjustment of the quizzes?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
            {
              question:
                "How much did the leaderboard motivate you to play quizzes more often?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
            {
              question:
                "How much did the achievements motivate you to play quizzes more often?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
            {
              question:
                "How useful were the additional resources for reading more about topics within BEACON Q?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
            {
              question:
                "How beneficial was the BEACON Q app for your studies during this semester?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
          ];
        } else {
          questions = [
            {
              question:
                "How much had you already studied for your final written exam before this quiz?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
            {
              question:
                "How much did this quiz improve your confidence for your upcoming final written exam?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
            {
              question:
                "Will you be studying more for your final written exam based on your performance in this quiz?",
              questionType: "choice",
              isMultipleChoice: false,
              choices: ["Yes", "No"],
            },
            {
              question:
                "Did you find the scheduled nature of the quizzes too restrictive?",
              questionType: "choice",
              isMultipleChoice: false,
              choices: ["Yes", "No"],
            },
            {
              question:
                "Did the scheduling of the quizzes motivate you to play them in time?",
              questionType: "choice",
              isMultipleChoice: false,
              choices: ["Yes", "No"],
            },
            {
              question: "How useful was the Lighthouse for replaying quizzes?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
            {
              question:
                "How useful was the Lighthouse for inspecting your understanding of each topic?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
            {
              question:
                "Did you often forget to check the BEACON Q app for new quizzes?",
              questionType: "choice",
              isMultipleChoice: false,
              choices: ["Yes", "No"],
            },
            {
              question:
                "How useful did you find the dynamic difficulty adjustment of the quizzes?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
            {
              question:
                "How beneficial was the BEACON Q app for your studies during this semester?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
            {
              question:
                "How satisfied were you with the BEACON Q app experience?",
              questionType: "numericRange",
              min: 1,
              max: 5,
            },
          ];
        }
      }
      if (questions.length > 0) {
        return {
          err: null,
          questions: questions,
          existingSurveyAnswer: null,
        };
      }
      return {
        err: null,
        questions: null,
        existingSurveyAnswer: null,
      };
    } catch (err: unknown) {
      logger.error(err);
      return { err: err, questions: null, existingSurveyAnswer: null };
    }
  },
};

export default functions;
