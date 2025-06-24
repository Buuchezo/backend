import { SlotModel } from "../models/slotsModel";
import { UserModel } from "../models/userModel";

export async function restoreSlotCapacities(slotIds: string[]) {
  if (!Array.isArray(slotIds) || slotIds.length === 0) return;

  const workers = await UserModel.find({ role: "worker" });
  const maxCapacity = workers.length;

  for (const id of slotIds) {
    const slot = await SlotModel.findById(id);
    if (!slot || typeof slot.remainingCapacity !== "number") continue;

    const newCap = Math.min(slot.remainingCapacity + 1, maxCapacity);
    slot.remainingCapacity = newCap;
    slot.title = `Available Slot (${newCap} left)`;

    await slot.save();
    console.log("🔁 Restored capacity for slot:", id);
  }
}
