import mongoose, { Schema, Document, Query } from "mongoose";
import validator from "validator";
import bcrypt from "bcrypt";
import crypto from "crypto";

// Interface to type the User document
export interface IUser extends Document {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  passwordConfirm?: string; // For validation only
  passwordChangedAt?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  active: boolean;
  role: "user" | "worker" | "admin";
  correctPassword(candidatePassword: string): Promise<boolean>;
  changedPasswordAfter(JWTTimestamp: number): Promise<boolean>;
  createPasswordResetToken(): string;
}

const userSchema = new Schema<IUser>({
  _id: { type: String },
  firstName: { type: String, required: [true, "Must have first name"] },
  lastName: { type: String, required: [true, "Must have second name"] },
  email: {
    type: String,
    required: [true, "Please provide a valid email"],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, "Please provide a valid email"],
  },
  password: {
    type: String,
    required: [true, "Please provide a password"],
    minlength: 8,
    select: false,
  },
  passwordConfirm: {
    type: String,
    required: [true, "Please confirm your password"],
    validate: {
      validator: function (this: IUser, el: string) {
        return el === this.password;
      },
      message: "Passwords do not match",
    },
  },
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  active: { type: Boolean, default: true, select: false },
  role: {
    type: String,
    enum: ["user", "worker", "admin"],
    default: "user",
  },
});

// Create the User model

userSchema.pre("save", async function (next) {
  console.log("Pre-save hook triggered");

  if (!this.isModified("password")) return next();

  this.password = await bcrypt.hash(this.password, 12);
  this.passwordConfirm = undefined;

  next();
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || this.isNew) return next();

  this.passwordChangedAt = new Date(Date.now() - 1000);
  next();
});

userSchema.pre(/^find/, function (this: Query<IUser[], IUser>, next) {
  this.find({ active: { $ne: false } }); // Only return active users
  next();
});

userSchema.methods.correctPassword = async function (
  candidatePassword: string
): Promise<boolean> {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.changedPasswordAfter = async function (
  JWTTimestamp: number
): Promise<boolean> {
  if (this.passwordChangedAt) {
    const changedTimestamp = Math.floor(
      this.passwordChangedAt.getTime() / 1000
    );
    return JWTTimestamp < changedTimestamp;
  }

  // Password not changed after token was issued
  return false;
};

userSchema.methods.createPasswordResetToken = async function () {
  const resetToken = crypto.randomBytes(32).toString("hex");

  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;
  return resetToken;
};

export const UserModel = mongoose.model<IUser>("User", userSchema);
