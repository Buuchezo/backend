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

// function rangesOverlap(
//   aStart: Date,
//   aEnd: Date,
//   bStart: Date,
//   bEnd: Date
// ): boolean {
//   return aStart < bEnd && aEnd > bStart;
// }

// function groupOverlappingSlots(events: CalendarEventInput[]): string[][] {
//   const groups: { ids: string[]; range: [Date, Date] }[] = [];

//   for (const e of events) {
//     if (!e._id) continue;

//     const eStart = parseISO(e.start);
//     const eEnd = parseISO(e.end);
//     const eId = e._id.toString();

//     let added = false;
//     for (const group of groups) {
//       const [gStart, gEnd] = group.range;
//       if (rangesOverlap(eStart, eEnd, gStart, gEnd)) {
//         group.ids.push(eId);
//         group.range[0] = new Date(Math.min(gStart.getTime(), eStart.getTime()));
//         group.range[1] = new Date(Math.max(gEnd.getTime(), eEnd.getTime()));
//         added = true;
//         break;
//       }
//     }

//     if (!added) {
//       groups.push({ ids: [eId], range: [eStart, eEnd] });
//     }
//   }

//   return groups.map((g) => g.ids);
// }

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
//   slotsToUpdate: CalendarEventInput[];
//   groupedOverlappingIds: string[][];
//   originalAppointment: CalendarEventInput;
// } {
//   const formattedStart = normalizeToScheduleXFormat(eventData.start);
//   const formattedEnd = normalizeToScheduleXFormat(eventData.end);

//   const index = events.findIndex(
//     (e) => e._id?.toString() === eventData._id || e.id === eventData._id
//   );
//   if (index === -1) throw new Error("Original appointment not found");

//   const original = events[index];
//   if (!original._id) throw new Error("Missing _id in original appointment");

//   const newStart = parseISO(formattedStart);
//   const newEnd = parseISO(formattedEnd);
//   const originalStart = parseISO(original.start);
//   const originalEnd = parseISO(original.end);
//   const newClientId = original.clientId?.toString();

//   const hasConflict = events.some((e) => {
//     const isBooked =
//       e.calendarId === "booked" &&
//       e._id?.toString() !== original._id?.toString();
//     const overlaps = parseISO(e.start) < newEnd && parseISO(e.end) > newStart;
//     const sameClient = e.clientId?.toString() === newClientId;
//     return isBooked && overlaps && sameClient;
//   });

//   if (hasConflict) throw new Error("Booking conflict for this timeslot.");

//   const allAvailableSlots = events.filter((e) =>
//     e.title?.startsWith("Available Slot")
//   );

//   const slotsToUpdate: CalendarEventInput[] = [];
//   const slotIdSet = new Set();

//   // Collect only slots affected by the delta in overlap
//   for (const slot of allAvailableSlots) {
//     const slotStart = parseISO(slot.start);
//     const slotEnd = parseISO(slot.end);
//     const slotKey = slot._id?.toString();

//     if (!slotKey || slotIdSet.has(slotKey)) continue;
//     slotIdSet.add(slotKey);

//     const wasInOriginal = rangesOverlap(
//       slotStart,
//       slotEnd,
//       originalStart,
//       originalEnd
//     );
//     const isInNew = rangesOverlap(slotStart, slotEnd, newStart, newEnd);

//     if (typeof slot.remainingCapacity !== "number") continue;

//     if (wasInOriginal && !isInNew) {
//       slot.remainingCapacity = Math.min(slot.remainingCapacity + 1, 3);
//       slotsToUpdate.push(slot);
//     } else if (!wasInOriginal && isInNew) {
//       slot.remainingCapacity = Math.max(slot.remainingCapacity - 1, 0);
//       slotsToUpdate.push(slot);
//     }
//   }

//   const cleanedEvents = events.filter((e) => {
//     if (e.title !== "Available Slot") return true;
//     const eStart = parseISO(e.start);
//     const eEnd = parseISO(e.end);
//     return eEnd <= newStart || eStart >= newEnd;
//   });

//   const withoutOriginal = cleanedEvents.filter(
//     (e) => e._id?.toString() !== original._id!.toString()
//   );

//   const beforeSlots = generateAvailableSlotsBetweenBackend(
//     originalStart,
//     newStart
//   );
//   const afterSlots = generateAvailableSlotsBetweenBackend(newEnd, originalEnd);

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

//   const overlappingEvents = events.filter((e) => {
//     const eStart = parseISO(e.start);
//     const eEnd = parseISO(e.end);
//     return (
//       (e.calendarId === "booked" || e.title?.startsWith("Available Slot")) &&
//       eEnd > newStart &&
//       eStart < newEnd
//     );
//   });

//   const groupedOverlappingIds = groupOverlappingSlots(overlappingEvents);

//   return {
//     updatedEvents: [...beforeSlots, ...afterSlots],
//     slotsToInsert: [...beforeSlots, ...afterSlots],
//     updatedAppointment,
//     slotsToUpdate,
//     groupedOverlappingIds,
//     originalAppointment: original,
//   };
// }
function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function groupOverlappingSlots(events: CalendarEventInput[]): string[][] {
  const groups: { ids: string[]; range: [Date, Date] }[] = [];

  for (const e of events) {
    if (!e._id) continue;

    const eStart = parseISO(e.start);
    const eEnd = parseISO(e.end);
    const eId = e._id.toString();

    let added = false;
    for (const group of groups) {
      const [gStart, gEnd] = group.range;
      if (rangesOverlap(eStart, eEnd, gStart, gEnd)) {
        group.ids.push(eId);
        group.range[0] = new Date(Math.min(gStart.getTime(), eStart.getTime()));
        group.range[1] = new Date(Math.max(gEnd.getTime(), eEnd.getTime()));
        added = true;
        break;
      }
    }

    if (!added) {
      groups.push({ ids: [eId], range: [eStart, eEnd] });
    }
  }

  return groups.map((g) => g.ids);
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
//   slotsToUpdate: CalendarEventInput[];
//   groupedOverlappingIds: string[][];
//   originalAppointment: CalendarEventInput;
// } {
//   const formattedStart = normalizeToScheduleXFormat(eventData.start);
//   const formattedEnd = normalizeToScheduleXFormat(eventData.end);

//   const index = events.findIndex(
//     (e) => e._id?.toString() === eventData._id || e.id === eventData._id
//   );
//   if (index === -1) throw new Error("Original appointment not found");

//   const original = events[index];
//   if (!original._id) throw new Error("Missing _id in original appointment");

//   const newStart = parseISO(formattedStart);
//   const newEnd = parseISO(formattedEnd);
//   const originalStart = parseISO(original.start);
//   const originalEnd = parseISO(original.end);
//   const newClientId = original.clientId?.toString();

//   const hasConflict = events.some((e) => {
//     const isBooked =
//       e.calendarId === "booked" &&
//       e._id?.toString() !== original._id?.toString();
//     const overlaps = parseISO(e.start) < newEnd && parseISO(e.end) > newStart;
//     const sameClient = e.clientId?.toString() === newClientId;
//     return isBooked && overlaps && sameClient;
//   });

//   if (hasConflict) throw new Error("Booking conflict for this timeslot.");

//   const allSlots = events.filter(
//     (e) =>
//       e.title?.startsWith("Available Slot") || e.title === "Fully Booked Slot"
//   );

//   const slotsToUpdate: CalendarEventInput[] = [];
//   const slotIdSet = new Set();
//   const MAX_CAPACITY = workers.length;

//   const updatedSlotRange = generateAvailableSlotsBetweenBackend(
//     newStart,
//     newEnd
//   );
//   const existingSlotTimes = events.map((e) => `${e.start}-${e.end}`);
//   const slotsToInsert: CalendarEventInput[] = [];

//   for (const slot of updatedSlotRange) {
//     const slotStart = parseISO(slot.start);
//     const slotEnd = parseISO(slot.end);

//     const overlappingAppointments = events.filter((e) => {
//       return (
//         e.calendarId === "booked" &&
//         parseISO(e.start) < slotEnd &&
//         parseISO(e.end) > slotStart
//       );
//     });

//     const isFullyBooked = overlappingAppointments.length >= MAX_CAPACITY;
//     const remainingCapacity = Math.max(
//       MAX_CAPACITY - overlappingAppointments.length,
//       0
//     );

//     const existingSlot = allSlots.find(
//       (s) =>
//         normalizeToScheduleXFormat(s.start) === slot.start &&
//         normalizeToScheduleXFormat(s.end) === slot.end
//     );

//     const title = isFullyBooked
//       ? "Fully Booked Slot"
//       : remainingCapacity >= MAX_CAPACITY
//         ? "Available Slot"
//         : `Available Slot (${remainingCapacity} left)`;

//     const calendarId = isFullyBooked ? "fully booked" : "available";

//     const slotData: CalendarEventInput = {
//       ...(existingSlot ?? slot),
//       title,
//       calendarId,
//       remainingCapacity,
//     };

//     if (existingSlot) {
//       slotsToUpdate.push(slotData);
//     } else {
//       slotsToInsert.push(slotData);
//     }
//   }

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

//   const overlappingEvents = events.filter((e) => {
//     const eStart = parseISO(e.start);
//     const eEnd = parseISO(e.end);
//     return (
//       (e.calendarId === "booked" ||
//         e.title?.startsWith("Available Slot") ||
//         e.title === "Fully Booked Slot") &&
//       eEnd > newStart &&
//       eStart < newEnd
//     );
//   });

//   const groupedOverlappingIds = groupOverlappingSlots(overlappingEvents);

//   return {
//     updatedEvents: slotsToInsert,
//     slotsToInsert,
//     updatedAppointment,
//     slotsToUpdate,
//     groupedOverlappingIds,
//     originalAppointment: original,
//   };
// }
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
  slotsToUpdate: CalendarEventInput[];
  groupedOverlappingIds: string[][];
  originalAppointment: CalendarEventInput;
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
  const originalStart = parseISO(original.start);
  const originalEnd = parseISO(original.end);
  const newClientId = original.clientId?.toString();

  const hasConflict = events.some((e) => {
    const isBooked =
      e.calendarId === "booked" &&
      e._id?.toString() !== original._id?.toString();
    const overlaps = parseISO(e.start) < newEnd && parseISO(e.end) > newStart;
    const sameClient = e.clientId?.toString() === newClientId;
    return isBooked && overlaps && sameClient;
  });

  if (hasConflict) throw new Error("Booking conflict for this timeslot.");

  const allSlots = events.filter(
    (e) =>
      e.title?.startsWith("Available Slot") || e.title === "Fully Booked Slot"
  );

  const slotsToUpdate: CalendarEventInput[] = [];
  const slotIdSet = new Set();
  const MAX_CAPACITY = workers.length;

  const updatedSlotRange = generateAvailableSlotsBetweenBackend(
    newStart,
    newEnd
  );
  const existingSlotTimes = events.map((e) => `${e.start}-${e.end}`);
  const slotsToInsert: CalendarEventInput[] = [];

  for (const slot of updatedSlotRange) {
    const slotStart = parseISO(slot.start);
    const slotEnd = parseISO(slot.end);

    const overlappingAppointments = events.filter((e) => {
      return (
        e.calendarId === "booked" &&
        parseISO(e.start) < slotEnd &&
        parseISO(e.end) > slotStart &&
        e._id?.toString() !== original._id?.toString()
      );
    });

    // If original still overlaps this slot, include it
    if (slotStart < originalEnd && slotEnd > originalStart) {
      overlappingAppointments.push(original);
    }

    const isFullyBooked = overlappingAppointments.length >= MAX_CAPACITY;
    const remainingCapacity = Math.max(
      MAX_CAPACITY - overlappingAppointments.length,
      0
    );

    const existingSlot = allSlots.find(
      (s) =>
        normalizeToScheduleXFormat(s.start) === slot.start &&
        normalizeToScheduleXFormat(s.end) === slot.end
    );

    const title = isFullyBooked
      ? "Fully Booked Slot"
      : remainingCapacity >= MAX_CAPACITY
        ? "Available Slot"
        : `Available Slot (${remainingCapacity} left)`;

    const calendarId = isFullyBooked ? "fully booked" : "available";

    const slotData: CalendarEventInput = {
      ...(existingSlot ?? slot),
      title,
      calendarId,
      remainingCapacity,
    };

    if (existingSlot) {
      slotsToUpdate.push(slotData);
    } else {
      slotsToInsert.push(slotData);
    }
  }

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

  const overlappingEvents = events.filter((e) => {
    const eStart = parseISO(e.start);
    const eEnd = parseISO(e.end);
    return (
      (e.calendarId === "booked" ||
        e.title?.startsWith("Available Slot") ||
        e.title === "Fully Booked Slot") &&
      eEnd > newStart &&
      eStart < newEnd
    );
  });

  const groupedOverlappingIds = groupOverlappingSlots(overlappingEvents);

  return {
    updatedEvents: slotsToInsert,
    slotsToInsert,
    updatedAppointment,
    slotsToUpdate,
    groupedOverlappingIds,
    originalAppointment: original,
  };
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
//   slotsToUpdate: CalendarEventInput[];
//   groupedOverlappingIds: string[][];
//   originalAppointment: CalendarEventInput;
// } {
//   const formattedStart = normalizeToScheduleXFormat(eventData.start);
//   const formattedEnd = normalizeToScheduleXFormat(eventData.end);

//   const index = events.findIndex(
//     (e) => e._id?.toString() === eventData._id || e.id === eventData._id
//   );
//   if (index === -1) throw new Error("Original appointment not found");

//   const original = events[index];
//   if (!original._id) throw new Error("Missing _id in original appointment");

//   const newStart = parseISO(formattedStart);
//   const newEnd = parseISO(formattedEnd);
//   const originalStart = parseISO(original.start);
//   const originalEnd = parseISO(original.end);
//   const newClientId = original.clientId?.toString();

//   const hasConflict = events.some((e) => {
//     const isBooked =
//       e.calendarId === "booked" &&
//       e._id?.toString() !== original._id?.toString();
//     const overlaps = parseISO(e.start) < newEnd && parseISO(e.end) > newStart;
//     const sameClient = e.clientId?.toString() === newClientId;
//     return isBooked && overlaps && sameClient;
//   });

//   if (hasConflict) throw new Error("Booking conflict for this timeslot.");

//   const allAvailableSlots = events.filter((e) =>
//     e.title?.startsWith("Available Slot")
//   );

//   const slotsToUpdate: CalendarEventInput[] = [];
//   const slotIdSet = new Set();

//   for (const slot of allAvailableSlots) {
//     const slotStart = parseISO(slot.start);
//     const slotEnd = parseISO(slot.end);
//     const slotKey = slot._id?.toString();

//     if (!slotKey || slotIdSet.has(slotKey)) continue;
//     slotIdSet.add(slotKey);

//     const wasInOriginal = rangesOverlap(
//       slotStart,
//       slotEnd,
//       originalStart,
//       originalEnd
//     );
//     const isInNew = rangesOverlap(slotStart, slotEnd, newStart, newEnd);

//     if (typeof slot.remainingCapacity !== "number") continue;

//     if (wasInOriginal && !isInNew) {
//       slot.remainingCapacity = Math.min(slot.remainingCapacity + 1, 3);
//       slotsToUpdate.push(slot);
//     } else if (!wasInOriginal && isInNew) {
//       slot.remainingCapacity = Math.max(slot.remainingCapacity - 1, 0);
//       slotsToUpdate.push(slot);
//     }
//   }

//   const cleanedEvents = events.filter((e) => {
//     if (e.title !== "Available Slot") return true;
//     const eStart = parseISO(e.start);
//     const eEnd = parseISO(e.end);
//     return eEnd <= newStart || eStart >= newEnd;
//   });

//   const withoutOriginal = cleanedEvents.filter(
//     (e) => e._id?.toString() !== original._id!.toString()
//   );

//   const beforeSlotsRaw = generateAvailableSlotsBetweenBackend(
//     originalStart,
//     newStart
//   );
//   const afterSlotsRaw = generateAvailableSlotsBetweenBackend(
//     newEnd,
//     originalEnd
//   );

//   const existingSlotTimes = events
//     .filter((e) => e.title === "Available Slot")
//     .map((e) => `${e.start}-${e.end}`);

//   const slotsToInsert = [...beforeSlotsRaw, ...afterSlotsRaw].filter((slot) => {
//     const key = `${slot.start}-${slot.end}`;
//     return existingSlotTimes.includes(key);
//   });

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

//   const overlappingEvents = events.filter((e) => {
//     const eStart = parseISO(e.start);
//     const eEnd = parseISO(e.end);
//     return (
//       (e.calendarId === "booked" || e.title?.startsWith("Available Slot")) &&
//       eEnd > newStart &&
//       eStart < newEnd
//     );
//   });

//   const groupedOverlappingIds = groupOverlappingSlots(overlappingEvents);

//   return {
//     updatedEvents: slotsToInsert,
//     slotsToInsert,
//     updatedAppointment,
//     slotsToUpdate,
//     groupedOverlappingIds,
//     originalAppointment: original,
//   };
// }
