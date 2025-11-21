import mongoose, { HydratedDocument, Schema, Model, Types } from "mongoose";

export interface Permission {
  user: Types.ObjectId;
  resourceType:
    | "ACTIVITY"
    | "QUIZ"
    | "TOPIC"
    | "COURSE"
    | "COURSE_ANNOUNCEMENT";
  resource: Types.ObjectId;
  level: number; // 1 - execute, 2 - write, 4 - read (UNIX style)
  createdAt?: Date;
  updatedAt?: Date;
}

export type PermissionDocument = HydratedDocument<Permission>;

const permissionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    resourceType: {
      type: String,
      enum: ["ACTIVITY", "QUIZ", "TOPIC", "COURSE", "COURSE_ANNOUNCEMENT"],
      required: true,
    },
    resource: {
      type: Schema.Types.ObjectId,
      refPath: "resourceType",
      required: true,
    },
    level: {
      type: Number,
      enum: [1, 2, 3, 4, 5, 7],
      default: 4,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: "{VALUE} is not an integer value",
      },
    },
  },
  { collection: "permissions", timestamps: true },
);
permissionSchema.index(
  { resourceType: 1, user: 1, level: 1, resource: 1 },
  { unique: true },
);

export const PermissionModel: Model<PermissionDocument> =
  mongoose.model<PermissionDocument>("Permission", permissionSchema);

// Source/Inspiration: https://exploringjs.com/es6/ch_numbers.html#_use-case-for-octal-literals-unix-style-file-permissions
/**
 * Checks if ALL requested permissions are present within the provided permission value.
 *
 * @param {('read' | 'write' | 'execute')[]} permissions - List of permissions to check for.
 * @param {number} userPermissionValue - The integer value for a single user class (0-7),
 *                                       e.g., 7 (rwx), 5 (r-x), or 6 (rw-).
 * @returns {boolean} True if all required permissions are present, false otherwise.
 */
function hasPermissions(
  permissions: string[],
  userPermissionValue: number,
): boolean {
  // bitmask mapping for each permission type
  const PermissionMask = {
    read: 4, // 100 in binary
    write: 2, // 010 in binary
    execute: 1, // 001 in binary
  };
  // Possibilities:
  // - 7 (111) => read + write + execute
  // - 6 (110) => read + write
  // - 5 (101) => read + execute
  // - 4 (100) => read only

  // compute total required mask by OR-ing all expected permission values
  let totalRequiredMask = 0;
  for (const permission of permissions) {
    if (PermissionMask[permission] === undefined) {
      // unknown permission type, skip
      continue;
    }
    totalRequiredMask |= PermissionMask[permission];
  }

  // bitwise AND operation:
  // check if the bits set in 'totalRequiredMask' are also set
  // in 'userPermissionValue'. If the result of the AND operation
  // equals 'totalRequiredMask', it means all required bits are present.
  return (userPermissionValue & totalRequiredMask) === totalRequiredMask;
}

export { hasPermissions };
