import mongoose, { Schema, Model, HydratedDocument } from 'mongoose';

export interface BeaconResourceSection {
  sectionType: string;
  videoLinks?: string[];
  text?: string;
  imageIds?: string[];
  dartBlockProgram?: Record<string, any>;
  code?: string;
  codeLanguage?: string;
  editable?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const beaconResourceSectionSchema = new Schema<BeaconResourceSection>(
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
      type: Object,
      required: false,
    },
    // BeaconResourceCodeSection
    code: { type: String, required: false },
    // BeaconResourceCodeSection
    codeLanguage: { type: String, required: false },
    // BeaconResourceDartBlockSection & BeaconResourceCodeSection
    editable: { type: Boolean, required: false },
  },
  { collection: 'beacon_resource_sections', timestamps: true }
);

//

export interface BeaconResource {
  title: string;
  body?: string;
  sections?: BeaconResourceSection[];
  tags?: string[];
  availableFrom?: Date;
  resourceType: string;
  resourceUUID: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type BeaconResourceDocument = HydratedDocument<BeaconResource>;

const beaconResourceSchema = new Schema(
  {
    title: { type: String, required: true },
    body: { type: String, required: false },
    sections: [beaconResourceSectionSchema],
    /// Introduced with BEACON Q 4.0.0
    tags: [{ type: String, required: false }],
    availableFrom: { type: Date, required: false },
    resourceType: { type: String, required: true },
    resourceUUID: { type: String, required: true },
  },
  { collection: 'beacon_resources', timestamps: true }
);

const BeaconResourceModel: Model<BeaconResourceDocument> =
  mongoose.model<BeaconResourceDocument>(
    'BeaconResource',
    beaconResourceSchema
  );

export {
  beaconResourceSectionSchema as sectionSchema,
  beaconResourceSchema as schema,
  BeaconResourceModel as model,
};
