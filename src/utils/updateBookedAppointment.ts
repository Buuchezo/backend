import { parseISO, format, addMinutes } from "date-fns";
import mongoose from "mongoose";
import { CalendarEventInput } from "../app";
import { IUser } from "../models/userModel";

function normalizeToScheduleXFormat(datetime: string): string {
  try {
    return format(parseISO(datetime), "yyyy-MM-dd HH:mm");
  } catch {
    return datetime;
  }
}

export function generateAvailableSlotsBetweenBackend(
  start: Date,
  end: Date
): CalendarEventInput[] {
  const slots: CalendarEventInput[] = [];
  let current = new Date(start);

  while (addMinutes(current, 60) <= end) {
    const slotEnd = addMinutes(current, 60);

    if (slotEnd <= end) {
      slots.push({
        _id: new mongoose.Types.ObjectId(),
        id: new mongoose.Types.ObjectId().toString(),
        title: "Available Slot",
        description: "",
        start: normalizeToScheduleXFormat(current.toISOString()),
        end: normalizeToScheduleXFormat(slotEnd.toISOString()),
        calendarId: "available",
        remainingCapacity: 1,
      });
    }

    current = slotEnd;
  }

  return slots;
}

export function updateEventHelperBackend({
  eventData,
  events,
  workers,
}: {
  eventData: CalendarEventInput;
  events: CalendarEventInput[];
  workers: any[];
}): {
  updatedEvents: CalendarEventInput[];
  updatedAppointment: CalendarEventInput;
  slotsToInsert: CalendarEventInput[];
} {
  const formattedStart = normalizeToScheduleXFormat(eventData.start);
  const formattedEnd = normalizeToScheduleXFormat(eventData.end);

  const index = events.findIndex(
    (e) => e._id?.toString() === eventData._id || e.id === eventData._id
  );
  if (index === -1) {
    throw new Error("Original appointment not found");
  }

  const original = events[index];
  if (!original._id) {
    throw new Error("Missing _id in original appointment");
  }

  const newStart = parseISO(formattedStart);
  const newEnd = parseISO(formattedEnd);
  const newClientId = original.clientId?.toString();

  // 🛑 Check for booking conflicts (same client, overlapping, not same appointment)
  const hasConflict = events.some((e) => {
    const isBooked =
      e.calendarId === "booked" &&
      e._id?.toString() !== original._id?.toString();
    const overlaps = parseISO(e.start) < newEnd && parseISO(e.end) > newStart;
    const sameClient = e.clientId?.toString() === newClientId;
    return isBooked && overlaps && sameClient;
  });

  if (hasConflict) {
    throw new Error("Booking conflict for this timeslot.");
  }

  const originalStart = parseISO(original.start);
  const originalEnd = parseISO(original.end);

  // 🧹 Clean overlapping slots
  const cleanedEvents = events.filter((e) => {
    if (e.title !== "Available Slot") return true;
    const eStart = parseISO(e.start);
    const eEnd = parseISO(e.end);
    return eEnd <= newStart || eStart >= newEnd;
  });

  // 🗑 Remove original from list
  const withoutOriginal = cleanedEvents.filter(
    (e) => e._id?.toString() !== original._id!.toString()
  );

  // 🔄 Generate new slots for before/after
  const beforeSlots = generateAvailableSlotsBetweenBackend(
    originalStart,
    newStart
  );
  const afterSlots = generateAvailableSlotsBetweenBackend(newEnd, originalEnd);

  // 👤 Get assigned worker for title
  const assignedWorker = workers.find(
    (w) => w._id?.toString() === original.ownerId?.toString()
  );

  const dynamicTitle = assignedWorker
    ? `Booked Appointment with ${assignedWorker.firstName} ${assignedWorker.lastName}`
    : "Booked Appointment";

  const updatedAppointment: CalendarEventInput = {
    _id: original._id,
    id: original._id.toString(),
    title: dynamicTitle,
    description: eventData.description || "",
    start: formattedStart,
    end: formattedEnd,
    calendarId: "booked",
    ownerId: original.ownerId,
    clientId: original.clientId,
    clientName: eventData.clientName ?? original.clientName ?? "Guest",
  };

  const updatedEvents = [
    ...withoutOriginal,
    ...beforeSlots,
    updatedAppointment,
    ...afterSlots,
  ];

  return {
    updatedEvents: [...beforeSlots, ...afterSlots],
    slotsToInsert: [...beforeSlots, ...afterSlots],
    updatedAppointment,
  };
}
