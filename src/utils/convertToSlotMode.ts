import { CalendarEventInput } from "../app";
import { Types } from "mongoose";
import { ISlot } from "../models/slotsModel"; // adjust path

/**
 * Converts a CalendarEventInput to a SlotModel-compatible object.
 */
export function convertToSlotModelInput(
  event: CalendarEventInput
): Partial<ISlot> {
  return {
    title: event.title,
    description: event.description,
    start: event.start,
    end: event.end,
    calendarId: event.calendarId ?? "booked",
    ownerId: parseObjectId(event.ownerId),
    clientId: parseObjectId(event.clientId),
    clientName: event.clientName,
    sharedWith: event.sharedWith
      ?.map(parseObjectId)
      .filter((id): id is Types.ObjectId => id !== undefined),
    visibility: event.visibility ?? "public",
    // Optional: You can track remainingCapacity manually if needed
  };
}

function parseObjectId(
  value?: string | Types.ObjectId
): Types.ObjectId | undefined {
  if (!value) return undefined;
  return typeof value === "string" && Types.ObjectId.isValid(value)
    ? new Types.ObjectId(value)
    : value instanceof Types.ObjectId
      ? value
      : undefined;
}
