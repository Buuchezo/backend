import { parseISO, addMinutes, format } from "date-fns";
import { CalendarEventInput } from "./generateSlots";
import { SlotModel } from "../models/slotsModel";
import { UserModel } from "../models/userModel";
import { Types } from "mongoose";

export async function reassignAppointmentsHelper(
  workerId: string
): Promise<void> {
  const workers = await UserModel.find({ role: "worker" });
  const sickWorker = workers.find((w) => w._id.toString() === workerId);
  if (!sickWorker) throw new Error("Sick worker not found");

  const events = await SlotModel.find({});
  const appointmentsToReassign = events.filter(
    (e) =>
      e.ownerId?.toString() === workerId &&
      e.title?.startsWith("Booked Appointment")
  );

  for (const appointment of appointmentsToReassign) {
    const start = parseISO(appointment.start);
    const end = parseISO(appointment.end);

    // Shuffle workers for fair distribution
    const availableWorkers = workers
      .filter((w) => w._id.toString() !== workerId)
      .sort(() => Math.random() - 0.5); // Randomize order

    // Try to directly assign to a free worker
    let reassigned = false;
    for (const w of availableWorkers) {
      const hasConflict = events.some(
        (e) =>
          e.ownerId?.toString() === w._id.toString() &&
          parseISO(e.start) < end &&
          parseISO(e.end) > start
      );

      if (!hasConflict) {
        await SlotModel.findByIdAndUpdate(appointment._id, {
          ownerId: w._id,
          title: `Booked Appointment with ${w.firstName} ${w.lastName}`,
        });
        reassigned = true;
        break;
      }
    }

    if (reassigned) continue;

    // Fallback: move to a different slot
    for (const altWorker of availableWorkers) {
      const candidateSlots = events.filter((e) => e.title === "Available Slot");

      for (const slot of candidateSlots) {
        const slotStart = parseISO(slot.start);
        const durationMinutes = (end.getTime() - start.getTime()) / 60000;
        const slotEnd = addMinutes(slotStart, durationMinutes);

        const conflict = events.some(
          (e) =>
            e.ownerId?.toString() === altWorker._id.toString() &&
            parseISO(e.start) < slotEnd &&
            parseISO(e.end) > slotStart
        );

        if (!conflict) {
          // Delete original appointment
          await SlotModel.findByIdAndDelete(appointment._id);

          // Delete overlapping Available Slots (✅ KEY FIX)
          await SlotModel.deleteMany({
            title: "Available Slot",
            start: { $lt: format(slotEnd, "yyyy-MM-dd HH:mm") },
            end: { $gt: format(slotStart, "yyyy-MM-dd HH:mm") },
          });

          // Create new booked appointment
          await SlotModel.create({
            title: `Booked Appointment with ${altWorker.firstName} ${altWorker.lastName}`,
            start: format(slotStart, "yyyy-MM-dd HH:mm"),
            end: format(slotEnd, "yyyy-MM-dd HH:mm"),
            calendarId: "booked",
            ownerId: altWorker._id,
            clientId: appointment.clientId,
            clientName: appointment.clientName,
          });

          reassigned = true;
          break;
        }
      }

      if (reassigned) break;
    }
  }
}
