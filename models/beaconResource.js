var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var beaconResourceSectionSchema = new Schema(
  {
    sectionType: {
      type: String,
      required: true,
    },
    // BeaconResourceExternalVideoLinksSection
    videoLinks: [{ type: String }],
    // BeaconResourceTextSection
    text: { type: String, required: false },
    // BeaconResourceImagesSection
    imageIds: [{ type: String }],
    // BeaconResourceDartBlockSection
    dartBlockProgram: {
      type: Map,
      required: false,
    },
    // BeaconResourceCodeSection
    code: {
      type: String,
      required: false,
    },
    // BeaconResourceCodeSection
    codeLanguage: {
      type: String,
      required: false,
    },
    // BeaconResourceDartBlockSection & BeaconResourceCodeSection
    editable: {
      type: Boolean,
      required: false,
    },
  },
  { collection: "beacon_resource_sections", timestamps: true },
);

var beaconResourceSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: false,
    },
    sections: [beaconResourceSectionSchema],
    /// Introduced with BEAOCN Q 4.0.0
    tags: [{ type: String, required: false }],
    availableFrom: {
      type: Date,
      required: false,
    },
    resourceType: {
      type: String,
      required: true,
    },
    resourceUUID: {
      type: String,
      required: true,
    },
  },
  { collection: "beacon_resources", timestamps: true },
);

module.exports = {
  schema: beaconResourceSchema,
  model: mongoose.model("BeaconResource", beaconResourceSchema),
};
