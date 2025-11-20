import mongoose, { Schema, Model, HydratedDocument } from "mongoose";
import bcrypt from "bcrypt";

export interface SecretQuestion {
  question: string;
  answer: string;
}
const secretQuestionSchema = new Schema<SecretQuestion>({
  question: { type: String, required: true },
  answer: { type: String, required: true },
});

export interface User {
  username: string;
  password: string;
  role: "STUDENT" | "TEACHER";
  secretQuestions?: SecretQuestion[];
  date: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// instance (non-static) methods
export interface UserMethods {
  comparePassword(password: string): Promise<boolean>;
}

// Document type combining User shape + methods
export type UserDocument = HydratedDocument<User, UserMethods>;

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["STUDENT", "TEACHER"],
      default: "STUDENT",
      required: true,
    },
    secretQuestions: {
      type: [secretQuestionSchema],
      validate: {
        validator: function (v: any) {
          // allow undefined/null, but if provided ensure length < 4
          if (!v) return true;
          return Array.isArray(v) ? v.length <= 4 : false;
        },
        message: () =>
          `You cannot set more than 4 secret questions for your account.`,
      },
    },
    date: {
      type: Date,
      default: () => new Date(),
      immutable: true,
    },
  },
  { collection: "users", timestamps: true },
);

userSchema.method(
  "comparePassword",
  async function comparePassword(this: UserDocument, passw: string) {
    return bcrypt.compare(passw, this.password);
  },
);

userSchema.pre("save", async function (this: UserDocument) {
  if (!this.isModified("password") && !this.isNew) return;
  const hash = await bcrypt.hash(this.password, 10);
  this.password = hash;
});

// When creating the model, annotate it so queries return the typed document
export const UserModel = mongoose.model<UserDocument>("User", userSchema);
export default UserModel;
