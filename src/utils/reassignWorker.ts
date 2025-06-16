import { parseISO, addMinutes, format } from "date-fns";
import { CalendarEventInput } from "./generateSlots";
import { SlotModel } from "../models/slotsModel";
import { UserModel } from "../models/userModel";

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

  const updatedEvents = [...events];

  for (const appointment of appointmentsToReassign) {
    const start = parseISO(appointment.start);
    const end = parseISO(appointment.end);

    const availableWorker = workers.find(
      (w) =>
        w._id.toString() !== workerId &&
        !events.some(
          (e) =>
            e.ownerId?.toString() === w._id.toString() &&
            parseISO(e.start) < end &&
            parseISO(e.end) > start
        )
    );

    if (availableWorker) {
      await SlotModel.findByIdAndUpdate(appointment._id, {
        ownerId: availableWorker._id,
        title: `Booked Appointment with ${availableWorker.firstName} ${availableWorker.lastName}`,
      });
      continue;
    }

    // Fallback strategy: Find matching available slot
    for (const altWorker of workers.filter(
      (w) => w._id.toString() !== workerId
    )) {
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
          // Delete original
          await SlotModel.findByIdAndDelete(appointment._id);

          // Remove conflicting slots
          await SlotModel.deleteMany({
            title: "Available Slot",
            start: { $gte: slot.start },
            end: { $lte: format(slotEnd, "yyyy-MM-dd HH:mm") },
          });

          await SlotModel.create({
            title: `Booked Appointment with ${altWorker.firstName} ${altWorker.lastName}`,
            start: format(slotStart, "yyyy-MM-dd HH:mm"),
            end: format(slotEnd, "yyyy-MM-dd HH:mm"),
            calendarId: "booked",
            ownerId: altWorker._id,
            clientId: appointment.clientId,
            clientName: appointment.clientName,
          });
          break;
        }
      }
    }
  }
}
