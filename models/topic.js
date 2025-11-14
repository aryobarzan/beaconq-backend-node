var mongoose = require("mongoose");
var Schema = mongoose.Schema;
const beaconResource = require("./beaconResource");

var topicSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    version: {
      type: Number,
      default: 1,
      min: 1,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: "{VALUE} is not an integer value",
      },
    },
    // Introduced with BEACON Q 4.0.0.
    beaconResources: [beaconResource.schema],
    /// Deprecated: now use Mongoose's own timestamps createdAt & updatedAt
    // creationDate: {
    //   type: Date,
    //   default: () => new Date(),
    // },
    // updateDate: {
    //   type: Date,
    //   default: () => new Date(),
    // },
  },
  { collection: "topics", timestamps: true },
);

module.exports = mongoose.model("Topic", topicSchema);
