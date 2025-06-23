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
  const id = new mongoose.Types.ObjectId();

  while (addMinutes(current, 60) <= end) {
    const slotEnd = addMinutes(current, 60);

    if (slotEnd <= end) {
      slots.push({
        _id: id,
        id: id.toString(),
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

// export function updateEventHelperBackend({
//   eventData,
//   events,
//   workers,
// }: {
//   eventData: CalendarEventInput;
//   events: CalendarEventInput[];
//   workers: any[];
// }): {
//   updatedEvents: CalendarEventInput[];
//   updatedAppointment: CalendarEventInput;
//   slotsToInsert: CalendarEventInput[];
// } {
//   const formattedStart = normalizeToScheduleXFormat(eventData.start);
//   const formattedEnd = normalizeToScheduleXFormat(eventData.end);

//   const index = events.findIndex(
//     (e) => e._id?.toString() === eventData._id || e.id === eventData._id
//   );
//   if (index === -1) {
//     throw new Error("Original appointment not found");
//   }

//   const original = events[index];
//   if (!original._id) {
//     throw new Error("Missing _id in original appointment");
//   }

//   const newStart = parseISO(formattedStart);
//   const newEnd = parseISO(formattedEnd);
//   const newClientId = original.clientId?.toString();

//   // Check for booking conflicts (same client, overlapping, not same appointment)
//   const hasConflict = events.some((e) => {
//     const isBooked =
//       e.calendarId === "booked" &&
//       e._id?.toString() !== original._id?.toString();
//     const overlaps = parseISO(e.start) < newEnd && parseISO(e.end) > newStart;
//     const sameClient = e.clientId?.toString() === newClientId;
//     return isBooked && overlaps && sameClient;
//   });

//   if (hasConflict) {
//     throw new Error("Booking conflict for this timeslot.");
//   }

//   const originalStart = parseISO(original.start);
//   const originalEnd = parseISO(original.end);

//   // Clean overlapping slots
//   const cleanedEvents = events.filter((e) => {
//     if (e.title !== "Available Slot") return true;
//     const eStart = parseISO(e.start);
//     const eEnd = parseISO(e.end);
//     return eEnd <= newStart || eStart >= newEnd;
//   });

//   //  Remove original from list
//   const withoutOriginal = cleanedEvents.filter(
//     (e) => e._id?.toString() !== original._id!.toString()
//   );

//   //  Generate new slots for before/after
//   const beforeSlots = generateAvailableSlotsBetweenBackend(
//     originalStart,
//     newStart
//   );
//   const afterSlots = generateAvailableSlotsBetweenBackend(newEnd, originalEnd);

//   //  Get assigned worker for title
//   const assignedWorker = workers.find(
//     (w) => w._id?.toString() === original.ownerId?.toString()
//   );

//   const dynamicTitle = assignedWorker
//     ? `Booked Appointment with ${assignedWorker.firstName} ${assignedWorker.lastName}`
//     : "Booked Appointment";

//   const updatedAppointment: CalendarEventInput = {
//     _id: original._id,
//     id: original._id.toString(),
//     title: dynamicTitle,
//     description: eventData.description || "",
//     start: formattedStart,
//     end: formattedEnd,
//     calendarId: "booked",
//     ownerId: original.ownerId,
//     clientId: original.clientId,
//     clientName: eventData.clientName ?? original.clientName ?? "Guest",
//   };

//   const updatedEvents = [
//     ...withoutOriginal,
//     ...beforeSlots,
//     updatedAppointment,
//     ...afterSlots,
//   ];

//   return {
//     updatedEvents,
//     slotsToInsert: [...beforeSlots, ...afterSlots],
//     updatedAppointment,
//   };
// }

///////////////////////////////////////////////////////////////////////////////

// export function updateEventHelperBackend({
//   eventData,
//   events,
//   workers,
// }: {
//   eventData: CalendarEventInput;
//   events: CalendarEventInput[];
//   workers: any[];
// }): {
//   updatedEvents: CalendarEventInput[];
//   updatedAppointment: CalendarEventInput;
//   slotsToInsert: CalendarEventInput[];
//   overlappingBookedIds: string[];
// } {
//   const formattedStart = normalizeToScheduleXFormat(eventData.start);
//   const formattedEnd = normalizeToScheduleXFormat(eventData.end);

//   const index = events.findIndex(
//     (e) => e._id?.toString() === eventData._id || e.id === eventData._id
//   );
//   if (index === -1) {
//     throw new Error("Original appointment not found");
//   }

//   const original = events[index];
//   if (!original._id) {
//     throw new Error("Missing _id in original appointment");
//   }

//   const newStart = parseISO(formattedStart);
//   const newEnd = parseISO(formattedEnd);
//   const newClientId = original.clientId?.toString();

//   // Check for booking conflicts (same client, overlapping, not same appointment)
//   const hasConflict = events.some((e) => {
//     const isBooked =
//       e.calendarId === "booked" &&
//       e._id?.toString() !== original._id?.toString();
//     const overlaps = parseISO(e.start) < newEnd && parseISO(e.end) > newStart;
//     const sameClient = e.clientId?.toString() === newClientId;
//     return isBooked && overlaps && sameClient;
//   });

//   if (hasConflict) {
//     throw new Error("Booking conflict for this timeslot.");
//   }

//   const originalStart = parseISO(original.start);
//   const originalEnd = parseISO(original.end);

//   // Restore original slot capacity if we moved away from those slots
//   const allAvailableSlots = events.filter((e) => e.title === "Available Slot");

//   for (const slot of allAvailableSlots) {
//     const slotStart = parseISO(slot.start);
//     const slotEnd = parseISO(slot.end);

//     const overlapsOriginal =
//       slotStart < originalEnd &&
//       slotEnd > originalStart &&
//       !(slotStart < newEnd && slotEnd > newStart);

//     if (overlapsOriginal && typeof slot.remainingCapacity === "number") {
//       slot.remainingCapacity = Math.min(slot.remainingCapacity + 1, 3);
//     }
//   }

//   // Decrease capacity in new slot range if newly added
//   for (const slot of allAvailableSlots) {
//     const slotStart = parseISO(slot.start);
//     const slotEnd = parseISO(slot.end);

//     const overlapsNew =
//       slotStart < newEnd &&
//       slotEnd > newStart &&
//       !(slotStart < originalEnd && slotEnd > originalStart);

//     if (overlapsNew && typeof slot.remainingCapacity === "number") {
//       slot.remainingCapacity = Math.max(slot.remainingCapacity - 1, 0);
//     }
//   }

//   // Clean overlapping slots
//   const cleanedEvents = events.filter((e) => {
//     if (e.title !== "Available Slot") return true;
//     const eStart = parseISO(e.start);
//     const eEnd = parseISO(e.end);
//     return eEnd <= newStart || eStart >= newEnd;
//   });

//   //  Remove original from list
//   const withoutOriginal = cleanedEvents.filter(
//     (e) => e._id?.toString() !== original._id!.toString()
//   );

//   //  Generate new slots for before/after
//   const beforeSlots = generateAvailableSlotsBetweenBackend(
//     originalStart,
//     newStart
//   );
//   const afterSlots = generateAvailableSlotsBetweenBackend(newEnd, originalEnd);

//   //  Get assigned worker for title
//   const assignedWorker = workers.find(
//     (w) => w._id?.toString() === original.ownerId?.toString()
//   );

//   const dynamicTitle = assignedWorker
//     ? `Booked Appointment with ${assignedWorker.firstName} ${assignedWorker.lastName}`
//     : "Booked Appointment";

//   const updatedAppointment: CalendarEventInput = {
//     _id: original._id,
//     id: original._id.toString(),
//     title: dynamicTitle,
//     description: eventData.description || "",
//     start: formattedStart,
//     end: formattedEnd,
//     calendarId: "booked",
//     ownerId: original.ownerId,
//     clientId: original.clientId,
//     clientName: eventData.clientName ?? original.clientName ?? "Guest",
//   };

//   // const updatedEvents = [
//   //   ...withoutOriginal,
//   //   ...beforeSlots,
//   //   updatedAppointment,
//   //   ...afterSlots,
//   // ];

//   // ✅ Collect all booked appointment IDs for the same timeslot
//   const overlappingBookedIds = events
//     .filter((e) => {
//       const eStart = parseISO(e.start);
//       const eEnd = parseISO(e.end);
//       return (
//         (e.calendarId === "booked" || e.title === "Available Slot") &&
//         eEnd > newStart &&
//         eStart < newEnd
//       );
//     })
//     .map((e) => e._id?.toString())
//     .filter((id): id is string => !!id);
//   console.log(overlappingBookedIds);
//   return {
//     updatedEvents: [...beforeSlots, ...afterSlots],
//     slotsToInsert: [...beforeSlots, ...afterSlots],
//     updatedAppointment,
//     overlappingBookedIds,
//   };
// }

/////////////////////////////////////////////////////////////////////////////////

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
  overlappingBookedIds: string[];
} {
  const formattedStart = normalizeToScheduleXFormat(eventData.start);
  const formattedEnd = normalizeToScheduleXFormat(eventData.end);

  const index = events.findIndex(
    (e) => e._id?.toString() === eventData._id || e.id === eventData._id
  );
  if (index === -1) throw new Error("Original appointment not found");

  const original = events[index];
  if (!original._id) throw new Error("Missing _id in original appointment");

  const newStart = parseISO(formattedStart);
  const newEnd = parseISO(formattedEnd);
  const newClientId = original.clientId?.toString();

  console.log("🔍 Checking for conflicts with:");
  console.log("🆕 New range:", newStart, newEnd);

  const hasConflict = events.some((e) => {
    const isBooked =
      e.calendarId === "booked" &&
      e._id?.toString() !== original._id?.toString();
    const overlaps = parseISO(e.start) < newEnd && parseISO(e.end) > newStart;
    const sameClient = e.clientId?.toString() === newClientId;
    return isBooked && overlaps && sameClient;
  });

  if (hasConflict) throw new Error("Booking conflict for this timeslot.");

  const originalStart = parseISO(original.start);
  const originalEnd = parseISO(original.end);

  const allAvailableSlots = events.filter((e) => e.title === "Available Slot");

  for (const slot of allAvailableSlots) {
    const slotStart = parseISO(slot.start);
    const slotEnd = parseISO(slot.end);

    const overlapsOriginal =
      slotStart < originalEnd &&
      slotEnd > originalStart &&
      !(slotStart < newEnd && slotEnd > newStart);

    if (overlapsOriginal && typeof slot.remainingCapacity === "number") {
      slot.remainingCapacity = Math.min(slot.remainingCapacity + 1, 3);
      console.log(
        "🔄 Restoring capacity in original slot:",
        slot._id?.toString()
      );
    }
  }

  for (const slot of allAvailableSlots) {
    const slotStart = parseISO(slot.start);
    const slotEnd = parseISO(slot.end);

    const overlapsNew =
      slotStart < newEnd &&
      slotEnd > newStart &&
      !(slotStart < originalEnd && slotEnd > originalStart);

    if (overlapsNew && typeof slot.remainingCapacity === "number") {
      slot.remainingCapacity = Math.max(slot.remainingCapacity - 1, 0);
      console.log("➖ Reducing capacity in new slot:", slot._id?.toString());
    }
  }

  const cleanedEvents = events.filter((e) => {
    if (e.title !== "Available Slot") return true;
    const eStart = parseISO(e.start);
    const eEnd = parseISO(e.end);
    return eEnd <= newStart || eStart >= newEnd;
  });

  const withoutOriginal = cleanedEvents.filter(
    (e) => e._id?.toString() !== original._id!.toString()
  );

  const beforeSlots = generateAvailableSlotsBetweenBackend(
    originalStart,
    newStart
  );
  const afterSlots = generateAvailableSlotsBetweenBackend(newEnd, originalEnd);
  console.log("➕ Generated before slots:", beforeSlots.length);
  console.log("➕ Generated after slots:", afterSlots.length);

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

  // ✅ Include all overlapping slot or booking IDs
  const overlappingBookedIds = events
    .filter((e) => {
      const eStart = parseISO(e.start);
      const eEnd = parseISO(e.end);
      return (
        (e.calendarId === "booked" || e.title === "Available Slot") &&
        eEnd > newStart &&
        eStart < newEnd
      );
    })
    .map((e) => e._id?.toString())
    .filter((id): id is string => !!id);

  console.log("🆔 overlappingBookedIds:", overlappingBookedIds);

  return {
    updatedEvents: [...beforeSlots, ...afterSlots], // These contain updated capacities
    slotsToInsert: [...beforeSlots, ...afterSlots],
    updatedAppointment,
    overlappingBookedIds,
  };
}
