import mongoose, { Schema } from "mongoose";

export interface ISlot extends Document {
  title: string;
  description: string;
  start: string;
  end: string;
  appointments: mongoose.Types.ObjectId[];
  workerCapacity: number;
}

const slotSchema = new Schema<ISlot>({
  title: { type: String },
  description: { type: String },
  start: { type: String, required: true },
  end: { type: String, required: true },
  appointments: [{ type: Schema.Types.ObjectId, ref: "Appointment" }],
  workerCapacity: { type: Number, default: 1 },
});

export const SlotModel = mongoose.model<ISlot>("slot", slotSchema);
