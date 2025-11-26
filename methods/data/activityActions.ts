import { ActivityDocument, ActivityModel } from '../../models/activity';
import { PermissionModel, hasPermissions } from '../../models/permission';
import { ActivityArchiveModel } from '../../models/archive/activityArchive';
import ModelHelper from '../../middleware/modelHelper';
import mongoose from 'mongoose';
import logger from '../../middleware/logger';
import { Response } from 'express';

async function archiveActivity(
  activity: ActivityDocument,
  session: mongoose.ClientSession
) {
  const activityArchive = new ActivityArchiveModel({ activity });
  return activityArchive.save({ session });
}

enum CreateOrUpdateActivityStatus {
  Created = 200,
  Updated = 209,
  MissingArguments = 400,
  InternalError = 500,
}

enum GetActivitiesStatus {
  Retrieved = 200,
  None = 209,
  InternalError = 500,
}

class CreateOrUpdateActivityPermissionError extends Error {
  constructor() {
    super('Lacking permission to update');
    this.name = 'CreateOrUpdateActivityPermissionError';
    Object.setPrototypeOf(
      this,
      CreateOrUpdateActivityPermissionError.prototype
    );
  }
}

const functions = {
  createOrUpdateActivity: async function (
    req: Express.AuthenticatedRequest<{}, {}, { activity: string }>,
    res: Response
  ) {
    if (req.token.role !== UserRole.TEACHER) {
      return res.status(403).send({
        message: 'Activity creation failed: only teachers are authorized.',
      });
    }

    let activityJSON: any;
    try {
      activityJSON = JSON.parse(req.body.activity);
    } catch (_: unknown) {
      return res.status(CreateOrUpdateActivityStatus.MissingArguments).send({
        message: 'Activity creation failed: activity could not be parsed.',
      });
    }

    const newActivity = ModelHelper.decodeActivity(activityJSON);
    if (!newActivity) {
      return res.status(CreateOrUpdateActivityStatus.InternalError).send({
        message:
          'Activity creation failed: activity could not be deserialized.',
      });
    }

    let session: mongoose.ClientSession;
    try {
      session = await mongoose.startSession();
    } catch (err: unknown) {
      return res.status(CreateOrUpdateActivityStatus.InternalError).send({
        message: `Activity creation/update failed: internal error (session). (${err})`,
      });
    }

    let result: ActivityDocument | undefined;
    let responseStatusCode: number = CreateOrUpdateActivityStatus.Updated;
    try {
      await session.withTransaction(async () => {
        const existingActivity = await ActivityModel.findById(newActivity._id)
          .session(session)
          .exec();
        // Create new activity
        if (!existingActivity) {
          responseStatusCode = CreateOrUpdateActivityStatus.Created;
          const savedActivity = await newActivity.save({ session });
          await new PermissionModel({
            user: req.token._id,
            resourceType: 'ACTIVITY',
            resource: savedActivity._id,
            level: PermissionLevel.EXECUTE,
          }).save({ session });
          await archiveActivity(savedActivity, session);
          const populatedActivity =
            await ModelHelper.populateActivity(savedActivity);
          if (!populatedActivity) {
            throw new Error('Failed to populate Topics for created activity');
          }
          result = populatedActivity;
        }
        // Update existing activity
        else {
          // Does the teacher have permission to update the existing activity
          const permission = await PermissionModel.findOne({
            user: req.token._id,
            resource: existingActivity._id,
            resourceType: 'ACTIVITY',
          })
            .session(session)
            .lean()
            .exec();
          if (
            !permission ||
            !Number.isInteger(permission.level) ||
            !hasPermissions(['write'], permission.level)
          ) {
            throw new CreateOrUpdateActivityPermissionError();
          }

          // Option '{ overwriteDiscriminatorKey: true }' is IMPORTANT!!!
          // This ensures that the base Activity schema model can be used to perform updates for any of its discrminators,
          // as long as its discriminator key 'kind' is indicated in its updated version.
          // If omitted, updates will only reflect the updated base fields which is not the intended behavior.
          newActivity.version = existingActivity.version + 1;
          const updatedActivity = await ActivityModel.findByIdAndUpdate(
            existingActivity._id,
            newActivity,
            { overwriteDiscriminatorKey: true, new: true, session }
          ).exec();
          if (!updatedActivity) {
            throw new Error('Failed to update activity');
          }
          logger.info('Updated activity: ' + updatedActivity._id);
          const populatedActivity =
            await ModelHelper.populateActivity(updatedActivity);
          if (!populatedActivity) {
            throw new Error('Failed to populate Topics for updated activity');
          }
          result = populatedActivity;
          await archiveActivity(updatedActivity, session);
        }
      });
      // Creation or update of activity was successful.
      if (result) {
        const message =
          responseStatusCode == CreateOrUpdateActivityStatus.Created
            ? 'Activity created.'
            : 'Activity updated.';
        return res.status(responseStatusCode).send({
          message: message,
          activity: result.toJSON(),
        });
      } else {
        return res.status(CreateOrUpdateActivityStatus.InternalError).send({
          message: 'Activity creation/update failed: internal error.',
        });
      }
    } catch (err: unknown) {
      logger.error(err);
      if (err instanceof CreateOrUpdateActivityPermissionError) {
        return res.status(403).send({ message: err.message });
      }
      return res.status(CreateOrUpdateActivityStatus.InternalError).send({
        message: `Activity creation/update failed: internal error. (${err})`,
      });
    } finally {
      session.endSession();
    }
  },
  getActivities: async function (
    req: Express.AuthenticatedRequest,
    res: Response
  ) {
    if (req.token.role !== UserRole.TEACHER) {
      return res.status(403).send({
        message: 'Activity fetching failed: only teachers are authorized.',
      });
    }
    try {
      const activities = await ActivityModel.aggregate([
        {
          $lookup: {
            from: 'permissions',
            localField: '_id',
            foreignField: 'resource',
            as: 'permissions',
          },
        },
        {
          $match: {
            permissions: {
              // Important to use $elemMatch such that the same Permission document is used for these field checks
              $elemMatch: {
                resourceType: 'ACTIVITY',
                user: new mongoose.Types.ObjectId(req.token._id),
                level: { $gte: PermissionLevel.READ },
              },
            },
          },
        },
        { $unset: ['permissions'] },
      ]).exec();
      if (!activities || activities.length === 0) {
        return res
          .status(GetActivitiesStatus.None)
          .send({ message: 'Activity fetching found no activities.' });
      } else {
        const populatedActivities =
          await ModelHelper.populateActivities(activities);
        if (!populatedActivities) {
          return res.status(GetActivitiesStatus.InternalError).send({
            message: 'Activity fetching failed: failed to populate Topics.',
          });
        }
        return res.status(GetActivitiesStatus.Retrieved).send({
          activities: populatedActivities.map((a) => a.toJSON()),
        });
      }
    } catch (err: unknown) {
      logger.error(err);
      return res.status(GetActivitiesStatus.InternalError).send({
        message: `Activity fetching failed: an error occurred. (${err})`,
      });
    }
  },
};

export default functions;
