var FSRSModel = require("../../models/fsrsModel");
var mongoose = require("mongoose");
const logger = require("../../middleware/logger");

const StoreFSRSModelsStatus = Object.freeze({
  Stored: 200,
  MissingArguments: 400,
  InternalError: 500,
});

var functions = {
  storeFSRSModels: function (req, res) {
    if (!req.body.fsrsModels) {
      res.status(StoreFSRSModelsStatus.MissingArguments).send({
        message: "FSRS models storage failed: parameter missing.",
      });
      return;
    }
    const userId = new mongoose.Types.ObjectId(String(req.token._id));
    /// IMPORTANT - remember to use JSON.parse, as req.body.fsrsModels on its own is a string rather than an array.
    /// Alternative: look into body-parser package's "extended=true" option.
    const fsrsModelsJSON = JSON.parse(req.body.fsrsModels);
    var fsrsModels = [];
    // var searchConditions = [];
    var dataIdsToSearch = [];
    for (let i in fsrsModelsJSON) {
      /// Add user field for all the documents - the client does not include this information.
      /// Omission of this property causes a validation error.
      fsrsModelsJSON[i]["user"] = userId;
      try {
        let fsrsModel = new FSRSModel(fsrsModelsJSON[i]);
        if (fsrsModel) {
          fsrsModels.push(fsrsModel);
          //   searchConditions.push({
          //     $and: [
          //       { dataId: fsrsModel.dataId },
          //       { dataType: fsrsModel.dataType },
          //       { user: userId },
          //     ],
          //   });
          dataIdsToSearch.push(
            new mongoose.Types.ObjectId(String(fsrsModel.dataId)),
          );
        }
      } catch (err) {
        logger.error(err);
      }
    }
    FSRSModel.find({ user: userId, dataId: { $in: dataIdsToSearch } })
      // FSRSModel.find()
      //   .or(searchConditions)
      .exec()
      .then((existingFSRSModels) => {
        var operations = [];
        for (var i in fsrsModels) {
          let fsrsModel = fsrsModels[i];
          var filtered = existingFSRSModels.filter((x) => {
            return (
              x.dataId === fsrsModel.dataId &&
              x.dataType === fsrsModel.dataType &&
              /// Do not compare equality of two ObjectIds, but rely on strings
              x.user.toString() === userId.toString()
            );
          });
          if (filtered && filtered.length > 0) {
            /// Manually raise version number
            fsrsModel.version++;
            /// updateOne operation expects JS object or string, NOT mongoose object!
            let updatedFSRSModel = fsrsModel.toObject();
            /// updateOne breaks with _id included in document as it is an immutable field
            delete updatedFSRSModel._id;
            operations.push({
              updateOne: {
                filter: {
                  $and: [
                    { dataId: fsrsModel.dataId },
                    { dataType: fsrsModel.dataType },
                    { user: userId },
                    {
                      "reviewLog.review": {
                        $lt: fsrsModel.reviewLog.review,
                      },
                    },
                  ],
                },
                update: updatedFSRSModel,
              },
            });
          } else {
            operations.push({ insertOne: { document: fsrsModel } });
          }
        }

        FSRSModel.bulkWrite(operations)
          .then((result) => {
            res.status(StoreFSRSModelsStatus.Stored).send({
              message: "FSRS models stored or updated.",
              insertedCount: result.insertedCount,
              updatedCount: result.modifiedCount,
            });
          })
          .catch((err) => {
            logger.error(err);
            res.status(StoreFSRSModelsStatus.InternalError).send({
              message:
                "An error occurred while writing the insertions and updates of FSRS models.",
            });
          });
      })
      .catch((err) => {
        logger.error(err);
        res.status(StoreFSRSModelsStatus.InternalError).send({
          message:
            "An error occurred while searching for existing FSRS models.",
        });
      });
  },
};

module.exports = functions;
