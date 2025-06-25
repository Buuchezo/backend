import mongoose, { Schema, Document } from "mongoose";

// Interface to type the User document
export interface IInternalEvent extends Document {
  _id: mongoose.Types.ObjectId; //
  title: string;
  description: string;
  start: string;
  end: string;
  calendarId?: string;
  ownerId?: mongoose.Types.ObjectId;
  sharedWith?: mongoose.Types.ObjectId[];
  visibility?: "internal";
}

const internalEventsSchema = new Schema<IInternalEvent>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    start: { type: String, required: true },
    end: { type: String, required: true },
    calendarId: { type: String },
    ownerId: { type: Schema.Types.ObjectId, ref: "User" },
    sharedWith: [{ type: Schema.Types.ObjectId, ref: "User" }],
    visibility: {
      type: String,
      enum: ["internal"],
    },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Create the User model
export const InternalEventModel = mongoose.model<IInternalEvent>(
  "InternalEvent",
  internalEventsSchema
);
