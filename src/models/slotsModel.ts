import mongoose, { Schema } from "mongoose";

export interface ISlot extends Document {
  _id?: mongoose.Types.ObjectId;
  title: string;
  description: string;
  start: string;
  end: string;
  calendarId?: "available" | "booked"| "fully booked";
  ownerId?: mongoose.Types.ObjectId;
  clientId?: mongoose.Types.ObjectId;
  clientName?: string;
  sharedWith?: mongoose.Types.ObjectId[];
  visibility?: "public" | "internal";
  remainingCapacity?: number;
  reducedSlotIds?: mongoose.Types.ObjectId[];
}

const slotSchema = new Schema<ISlot>({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  start: { type: String, required: true },
  end: { type: String, required: true },
  calendarId: {
    type: String,
    enum: ["available", "booked", "fully booked"],
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
  remainingCapacity: { type: Number, default: 0 },
  reducedSlotIds: {
    type: [mongoose.Schema.Types.ObjectId],
    default: [],
  },
});

export const SlotModel = mongoose.model<ISlot>("slot", slotSchema);
