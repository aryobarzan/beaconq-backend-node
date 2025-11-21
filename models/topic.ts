import mongoose, { HydratedDocument, Schema, Model } from "mongoose";
import {
  schema as beaconResourceSchema,
  BeaconResource,
} from "./beaconResource";

export interface Topic {
  title: string;
  description: string;
  version: number;
  // Introduced with BEACON Q 4.0.0.
  beaconResources?: BeaconResource[];
  createdAt?: Date;
  updatedAt?: Date;
}

export type TopicDocument = HydratedDocument<Topic>;

const topicSchema = new Schema(
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
    beaconResources: [beaconResourceSchema],
  },
  { collection: "topics", timestamps: true },
);

const TopicModel: Model<TopicDocument> = mongoose.model<TopicDocument>(
  "Topic",
  topicSchema,
);

export { TopicModel, topicSchema };
