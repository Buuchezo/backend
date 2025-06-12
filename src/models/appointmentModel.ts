import mongoose, { Schema, Document } from "mongoose";
import slugify from "slugify";

// Interface to type the User document
export interface IAppointment extends Document {
  title: string;
  description: string;
  start: string;
  end: string;
  calendarId?: "available" | "booked";
  ownerId?: mongoose.Types.ObjectId;
  clientId?: mongoose.Types.ObjectId;
  clientName?: string;
  sharedWith?: mongoose.Types.ObjectId[];
  visibility?: "public" | "internal";
  remainingCapacity?: number;
}

const appointmentSchema = new Schema<IAppointment>({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  start: { type: String, required: true },
  end: { type: String, required: true },
  calendarId: {
    type: String,
    enum: ["available", "booked"],
    default: "available",
  },
  ownerId: { type: Schema.Types.ObjectId, ref: "User" },
  clientId: { type: Schema.Types.ObjectId, ref: "User" },
  clientName: { type: String },
  sharedWith: [{ type: Schema.Types.ObjectId, ref: "User" }],
  visibility: {
    type: String,
    enum: ["public", "internal"],
    default: "public",
  },
});

// Create the User model
export const AppointmentModel = mongoose.model<IAppointment>(
  "Appointment",
  appointmentSchema
);
