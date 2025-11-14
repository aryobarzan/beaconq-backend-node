const Activity = require("../../models/activity");
const { Permission, hasPermissions } = require("../../models/permission");
const ActivityArchive = require("../../models/archive/activityArchive");
const ModelHelper = require("../../middleware/modelHelper");
const mongoose = require("mongoose");
const logger = require("../../middleware/logger");

async function archiveActivity(activity, session) {
  var activityArchive = new ActivityArchive({ activity: activity });
  return activityArchive.save({ session });
}

const CreateOrUpdateActivityStatus = Object.freeze({
  Created: 200,
  Updated: 209,
  MissingArguments: 400,
  InternalError: 500,
});

const GetActivitiesStatus = Object.freeze({
  Retrieved: 200,
  None: 209,
  InternalError: 500,
});

var functions = {
  createOrUpdateActivity: async function (req, res) {
    if (!req.body.activity) {
      return res.status(CreateOrUpdateActivityStatus.MissingArguments).send({
        message: "Activity creation failed: activity parameter missing.",
      });
    }
    if (req.token.role !== "TEACHER") {
      return res.status(403).send({
        message: "Activity creation failed: only teachers are authorized.",
      });
    }
    var newActivity = ModelHelper.decodeActivity(JSON.parse(req.body.activity));
    if (!newActivity) {
      return res.status(CreateOrUpdateActivityStatus.InternalError).send({
        message:
          "Activity creation failed: activity could not be deserialized.",
      });
    }
    let session;
    try {
      session = await mongoose.startSession();
    } catch (err) {
      return res.status(CreateOrUpdateActivityStatus.InternalError).send({
        message: `Activity creation/update failed: internal error (session). (${err})`,
      });
    }

    let result = null;
    let responseStatusCode = CreateOrUpdateActivityStatus.Updated;
    try {
      await session.withTransaction(async () => {
        const existingActivity = await Activity.BaseActivity.findById(
          newActivity._id,
        )
          .session(session)
          .exec();
        // Create new activity
        if (!existingActivity) {
          responseStatusCode = CreateOrUpdateActivityStatus.Created;
          const savedActivity = await newActivity.save({ session });
          await new Permission({
            user: req.token._id,
            resourceType: "ACTIVITY",
            resource: savedActivity.id,
            level: 7,
          }).save({ session });
          await archiveActivity(savedActivity, session);
          const populatedActivity =
            await ModelHelper.populateActivity(savedActivity);
          if (!populatedActivity) {
            throw new Error("Failed to populate Topics for created activity");
          }
          result = populatedActivity;
        }
        // Update existing activity
        else {
          // Does the teacher have permission to update the existing activity
          const permission = await Permission.findOne({
            user: req.token._id,
            resource: existingActivity._id,
            resourceType: "ACTIVITY",
          })
            .session(session)
            .lean()
            .exec();
          if (
            !permission ||
            !Number.isInteger(permission.level) ||
            !hasPermissions(["write"], permission.level)
          ) {
            const err = new Error("Lacking permission to update");
            err.status = 403; // known status code for "forbidden"
            throw err;
          }

          // Option '{ overwriteDiscriminatorKey: true }' is IMPORTANT!!!
          // This ensures that the base Activity schema model can be used to perform updates for any of its discrminators,
          // as long as its discriminator key 'kind' is indicated in its updated version.
          // If omitted, updates will only reflect the updated base fields which is not the intended behavior.
          newActivity.version = existingActivity.version + 1;
          const updatedActivity = await Activity.BaseActivity.findByIdAndUpdate(
            existingActivity._id,
            newActivity,
            { overwriteDiscriminatorKey: true, new: true, session },
          ).exec();
          if (!updatedActivity) {
            throw new Error("Failed to update activity");
          }
          logger.info("Updated activity: " + updatedActivity._id);
          const populatedActivity =
            await ModelHelper.populateActivity(updatedActivity);
          if (!populatedActivity) {
            throw new Error("Failed to populate Topics for updated activity");
          }
          result = populatedActivity;
          await archiveActivity(updatedActivity, session);
        }
      });
      // Creation or update of activity was successful.
      if (result) {
        const message =
          responseStatusCode == CreateOrUpdateActivityStatus.Created
            ? "Activity created."
            : "Activity updated.";
        return res.status(responseStatusCode).send({
          message: message,
          activity: result.toJSON(),
        });
      }
    } catch (err) {
      logger.error(err);
      if (err && err.status && Number.isInteger(err.status)) {
        return res.status(err.status).send({ message: err.message });
      }
      return res.status(CreateOrUpdateActivityStatus.InternalError).send({
        message: `Activity creation/update failed: internal error. (${err})`,
      });
    } finally {
      if (session) session.endSession();
    }
  },
  getActivities: async function (req, res) {
    if (req.token.role !== "TEACHER") {
      return res.status(403).send({
        message: "Activity fetching failed: only teachers are authorized.",
      });
    }
    try {
      const activities = await Activity.BaseActivity.aggregate([
        {
          $lookup: {
            from: "permissions",
            localField: "_id",
            foreignField: "resource",
            as: "permissions",
          },
        },
        {
          $match: {
            permissions: {
              // Important to use $elemMatch such that the same Permission document is used for these field checks
              $elemMatch: {
                resourceType: "ACTIVITY",
                user: mongoose.Types.ObjectId(req.token._id),
                level: { $gte: 4 },
              },
            },
          },
        },
        { $unset: ["permissions"] },
      ]).exec();
      if (!activities || activities.length === 0) {
        return res
          .status(GetActivitiesStatus.None)
          .send({ message: "Activity fetching found no activities." });
      } else {
        const populatedActivities =
          await ModelHelper.populateActivities(activities);
        if (!populatedActivities) {
          return res.status(GetActivitiesStatus.InternalError).send({
            message: "Activity fetching failed: failed to populate Topics.",
          });
        }
        return res.status(GetActivitiesStatus.Retrieved).send({
          activities: JSON.parse(JSON.stringify(populatedActivities)),
        });
      }
    } catch (err) {
      logger.error(err);
      return res.status(GetActivitiesStatus.InternalError).send({
        message: `Activity fetching failed: an error occurred. (${err})`,
      });
    }
  },
};

module.exports = functions;
