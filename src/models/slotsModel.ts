import mongoose, { Schema } from "mongoose";

export interface ISlot extends Document {
  title: string;
  description: string;
  start: string;
  end: string;
}

const slotSchema = new Schema<ISlot>({
  title: { type: String },
  description: { type: String },
  start: { type: String, required: true },
  end: { type: String, required: true },
});

export const SlotModel = mongoose.model<ISlot>("slot", slotSchema);
