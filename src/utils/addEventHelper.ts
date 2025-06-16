import { format, parseISO } from "date-fns";
import mongoose from "mongoose";
import { CalendarEventInput, User } from "../app";
import { IUser } from "../models/userModel";
import { parse } from "date-fns";

function normalizeToScheduleXFormat(datetime: string): string {
  try {
    return format(parseISO(datetime), "yyyy-MM-dd HH:mm");
  } catch {
    return datetime;
  }
}

export function hasClientDoubleBooked({
  events,
  start,
  end,
  clientId,
  clientName,
}: {
  events: CalendarEventInput[];
  start: string | Date;
  end: string | Date;
  clientId: string;
  clientName?: string;
}): boolean {
  const toDate = (value: string | Date): Date =>
    typeof value === "string" ? new Date(value) : value;

  const parsedStart = toDate(start);
  const parsedEnd = toDate(end);

  return events.some((e) => {
    const eventStart = toDate(e.start);
    const eventEnd = toDate(e.end);

    const normalizedEventClientId =
      typeof e.clientId === "string" ? e.clientId : e.clientId?.toString(); // handle ObjectId

    const isSameClient =
      normalizedEventClientId === clientId ||
      (clientName && e.clientName === clientName);

    const timeOverlap = parsedStart < eventEnd && parsedEnd > eventStart;

    return isSameClient && timeOverlap;
  });
}

export function addEventHelper({
  eventData,
  events,
  user,
  workers,
  lastAssignedIndex,
}: {
  eventData: CalendarEventInput;
  events: CalendarEventInput[];
  user: IUser | null;
  workers: IUser[];
  lastAssignedIndex: number;
}): {
  updatedEvents: CalendarEventInput[];
  lastAssignedIndex: number;
  newEvent: CalendarEventInput;
} | null {
  const formattedStart = normalizeToScheduleXFormat(eventData.start);
  const formattedEnd = normalizeToScheduleXFormat(eventData.end);

  const parsedStart = parse(formattedStart, "yyyy-MM-dd HH:mm", new Date());
  const parsedEnd = parse(formattedEnd, "yyyy-MM-dd HH:mm", new Date());

  const normalizedEvents = events.map((e) => ({
    ...e,
    start:
      typeof e.start === "string" ? e.start : new Date(e.start).toISOString(),
    end: typeof e.end === "string" ? e.end : new Date(e.end).toISOString(),
  }));

  const overlappingAppointments = normalizedEvents.filter((e) => {
    if (!e.title?.startsWith("Booked Appointment")) return false;
    const existingStart = parse(e.start, "yyyy-MM-dd HH:mm", new Date());
    const existingEnd = parse(e.end, "yyyy-MM-dd HH:mm", new Date());
    return parsedStart < existingEnd && parsedEnd > existingStart;
  });

  const clientId =
    eventData.clientId && mongoose.Types.ObjectId.isValid(eventData.clientId)
      ? new mongoose.Types.ObjectId(eventData.clientId)
      : user && mongoose.Types.ObjectId.isValid(user._id)
        ? new mongoose.Types.ObjectId(user._id)
        : undefined;



  if (!clientId) {
    return null;
  }

  // Overlap check: includes fallback to legacy clientName
  const userAlreadyBooked = normalizedEvents.some((e) => {
    const sameClient = e.clientId?.toString() === clientId.toString();
    const legacyNameMatch = e.clientName === eventData.clientName;

    const existingStart = parse(e.start, "yyyy-MM-dd HH:mm", new Date());
    const existingEnd = parse(e.end, "yyyy-MM-dd HH:mm", new Date());
    const timeOverlap = parsedStart < existingEnd && parsedEnd > existingStart;

    return (sameClient || legacyNameMatch) && timeOverlap;
  });

  if (userAlreadyBooked) {
    return null;
  }

  let freeWorker: IUser | undefined;
  for (let i = 0; i < workers.length; i++) {
    const index = (lastAssignedIndex + i) % workers.length;
    const worker = workers[index];

    const isBusy = overlappingAppointments.some(
      (appt) => appt.ownerId?.toString() === worker._id.toString()
    );

    if (!isBusy) {
      freeWorker = worker;
      lastAssignedIndex = (index + 1) % workers.length;
      break;
    }
  }


  if (!freeWorker) {
    return null;
  }

  const updatedEvents = [...normalizedEvents];

  const availableSlotIndex = updatedEvents.findIndex(
    (e) =>
      e.title === "Available Slot" &&
      normalizeToScheduleXFormat(e.start) === formattedStart &&
      normalizeToScheduleXFormat(e.end) === formattedEnd
  );

  if (availableSlotIndex !== -1) {
    const slot = updatedEvents[availableSlotIndex];
    const currentCap = slot.remainingCapacity ?? workers.length;
    const newCap = Math.max(0, currentCap - 1);

    if (newCap <= 0) {
      updatedEvents.splice(availableSlotIndex, 1);
    } else {
      updatedEvents[availableSlotIndex] = {
        ...slot,
        remainingCapacity: newCap,
      };
    }
  }

  const newObjectId = new mongoose.Types.ObjectId();

  const newEvent: CalendarEventInput = {
    id: newObjectId.toString(),
    _id: newObjectId,
    title: `Booked Appointment with ${freeWorker.firstName} ${freeWorker.lastName}`,
    description: eventData.description || "",
    start: formattedStart,
    end: formattedEnd,
    calendarId: "booked",
    ownerId: freeWorker._id,
    clientId,
    clientName:
      eventData.clientName ??
      `${user?.firstName ?? "Guest"} ${user?.lastName ?? ""}`.trim(),
  };

  updatedEvents.push(newEvent);

  return {
    updatedEvents,
    lastAssignedIndex,
    newEvent,
  };
}
