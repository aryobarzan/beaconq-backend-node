var ActivityUserAnswer = require("../models/logs/activityUserAnswer");
const User = require("../models/user");
var Quiz = require("../models/quiz");
var mongoose = require("mongoose");
var ScheduledQuiz = require("../models/scheduledQuiz");
var ScheduledQuizUserStart = require("../models/logs/scheduledQuizUserStart");
var ModelHelper = require("../middleware/modelHelper");
const { DateTime } = require("luxon");
const SurveyAnswer = require("../models/logs/surveyAnswer");
const logger = require("../middleware/logger");

///
var functions = {
  resetTeacherAnswers: function (req, res) {
    if (req.token.role != "TEACHER") {
      res.status(403).send({
        message:
          "Answer reset failed: you are not authorized to do this. (teacher only)",
      });
      return;
    }
    // ActivityUserAnswer.ChoiceActivityUserAnswer.find(
    //   {
    //     createdAt: { $lt: Date("2022-09-20T16:50:00.000Z") },
    //   },
    //   async function (err, userAnswers) {
    //     for (let i = 0; i < userAnswers.length; i++) {
    //       let answers = userAnswers[i].answers[0];
    //       if (Array.isArray(answers)) {
    //         // no conversion needed
    //       } else {
    //         logger.info(
    //           "Converting old schema of activity user answer field 'answers' from Map to Array..."
    //         );
    //         logger.info(userAnswers[i].toJSON());
    //         let answersArray = [];
    //         for ([key, value] of Object.entries(
    //           userAnswers[i].toJSON().answers[0]
    //         )) {
    //           answersArray.push({ answer: key, evaluation: value });
    //         }
    //         userAnswers[i].answers = answersArray;
    //         logger.info(userAnswers[i].toJSON());
    //         await ActivityUserAnswer.ChoiceActivityUserAnswer.findByIdAndUpdate(
    //           userAnswers[i]._id,
    //           userAnswers[i]
    //         ).exec();
    //       }
    //     }
    //   }
    // );
    // ActivityUserAnswer.RecallActivityUserAnswer.find(
    //   {
    //     createdAt: { $lt: Date("2022-09-20T16:50:00.000Z") },
    //   },
    //   async function (err, userAnswers) {
    //     for (let i = 0; i < userAnswers.length; i++) {
    //       let answers = userAnswers[i].answers[0];
    //       if (Array.isArray(answers)) {
    //         // no conversion needed
    //       } else {
    //         logger.info(
    //           "Converting old schema of activity user answer field 'answers' from Map to Array..."
    //         );
    //         logger.info(userAnswers[i].toJSON());
    //         let answersArray = [];
    //         for ([key, value] of Object.entries(
    //           userAnswers[i].toJSON().answers[0]
    //         )) {
    //           answersArray.push({ answer: key, evaluation: value });
    //         }
    //         userAnswers[i].answers = answersArray;
    //         logger.info(userAnswers[i].toJSON());
    //         await ActivityUserAnswer.RecallActivityUserAnswer.findByIdAndUpdate(
    //           userAnswers[i]._id,
    //           userAnswers[i]
    //         ).exec();
    //       }
    //     }
    //   }
    // );
    User.findById(req.token._id)
      .exec()
      .then((user) => {
        if (!user) {
          res
            .status(500)
            .send({ message: "Answer reset failed: user not found." });
        } else {
          if (user.role === "TEACHER") {
            var deletedAnswersCount = 0;
            ActivityUserAnswer.base
              .deleteMany({ user: req.token._id })
              .exec()
              .then((result) => {
                if (result && result.deletedCount) {
                  deletedAnswersCount = result.deletedCount;
                }
                ScheduledQuizUserStart.deleteMany({ user: req.token._id })
                  .exec()
                  .then((result) => {
                    var deletedQuizStartsCount = 0;
                    if (result && result.deletedCount) {
                      deletedQuizStartsCount = result.deletedCount;
                    }
                    res.status(200).send({
                      message:
                        deletedAnswersCount +
                        " quiz answers & " +
                        deletedQuizStartsCount +
                        " scheduled quiz starts deleted for " +
                        user.username +
                        ".",
                    });
                  })
                  .catch((err) => {
                    logger.error(err);
                    res.status(500).send({
                      message: "Answer reset failed: an error occurred.",
                    });
                  });
              })
              .catch((err) => {
                logger.error(err);
                res
                  .status(500)
                  .send({ message: "Answer reset failed: an error occurred." });
              });
          } else {
            res.status(403).send({
              message:
                "Answer reset failed: you are not authorized to do this. (teacher only)",
            });
          }
        }
      })
      .catch((err) => {
        logger.error(err);
        res
          .status(500)
          .send({ message: "Answer reset failed: user not found. (error)" });
      });
  },
};

module.exports = functions;
