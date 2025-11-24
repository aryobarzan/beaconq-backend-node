import { FSRSDocument, FSRSModel } from "../../models/fsrsModel";
import mongoose from "mongoose";
import logger from "../../middleware/logger";
import { Response } from "express";

enum StoreFSRSModelsStatus {
  Stored = 200,
  MissingArguments = 400,
  InternalError = 500,
}

const functions = {
  storeFSRSModels: async function (
    req: Express.AuthenticatedRequest<{}, {}, { fsrsModels: string }>,
    res: Response,
  ) {
    if (!req.body.fsrsModels) {
      return res.status(StoreFSRSModelsStatus.MissingArguments).send({
        message: "FSRS models storage failed: parameter missing.",
      });
    }
    const userId = new mongoose.Types.ObjectId(req.token._id);
    /// IMPORTANT - remember to use JSON.parse, as req.body.fsrsModels on its own is a string rather than an array.
    /// Alternative: look into body-parser package's "extended=true" option.
    let fsrsModelsJSON: any;
    try {
      fsrsModelsJSON = JSON.parse(req.body.fsrsModels);
    } catch (err: unknown) {
      logger.error(err);
      return res.status(StoreFSRSModelsStatus.InternalError).send({
        message: "FSRS models storage failed: parameter could not be parsed.",
      });
    }
    let fsrsModels: FSRSDocument[] = [];
    let dataIdsToSearch: mongoose.Types.ObjectId[] = [];
    for (let fsrsModelJSON of fsrsModelsJSON) {
      /// Add user field for all the documents - the client does not include this information.
      /// Omission of this property causes a validation error.
      fsrsModelJSON.user = userId;
      try {
        let fsrsModel = new FSRSModel(fsrsModelJSON);
        fsrsModels.push(fsrsModel);
        dataIdsToSearch.push(new mongoose.Types.ObjectId(fsrsModel.dataId));
      } catch (err: unknown) {
        logger.error(err);
      }
    }
    try {
      const existingFSRSModels = await FSRSModel.find({
        user: userId,
        dataId: { $in: dataIdsToSearch },
      }).exec();
      let operations: any[] = [];
      for (let fsrsModel of fsrsModels) {
        const filtered = existingFSRSModels.filter((x) => {
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
          const { _id, ...updatedFSRSModelWithoutId } = updatedFSRSModel;
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
              update: updatedFSRSModelWithoutId,
            },
          });
        } else {
          operations.push({ insertOne: { document: fsrsModel } });
        }
      }
      try {
        const result = await FSRSModel.bulkWrite(operations);
        return res.status(StoreFSRSModelsStatus.Stored).send({
          message: "FSRS models stored or updated.",
          insertedCount: result.insertedCount,
          updatedCount: result.modifiedCount,
        });
      } catch (err: unknown) {
        logger.error(err);
        return res.status(StoreFSRSModelsStatus.InternalError).send({
          message:
            "An error occurred while writing the insertions and updates of FSRS models.",
        });
      }
    } catch (err: unknown) {
      logger.error(err);
      return res.status(StoreFSRSModelsStatus.InternalError).send({
        message: "An error occurred while searching for existing FSRS models.",
      });
    }
  },
};

export default functions;
