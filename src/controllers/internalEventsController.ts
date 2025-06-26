import { Request, Response, NextFunction } from "express";
import { InternalEventModel } from "../models/internalEventModel";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/appErrorr";
import mongoose from "mongoose";
import { SlotModel } from "../models/slotsModel";
import { addMinutes, format, isAfter, isBefore, parseISO } from "date-fns";
import { UserModel } from "../models/userModel";
import { IInternalEvent } from "../models/internalEventModel";
import { updateEventHelperBackend } from "../utils/updateBookedAppointment";
import { CalendarEventInput } from "../app";

export const getAllInternalEvents = catchAsync(
  async (req: Request, res: Response) => {
    const allInternalEvents = await InternalEventModel.find();
    res.status(200).json({
      status: "success",
      results: allInternalEvents.length,
      data: {
        allInternalEvents,
      },
    });
  }
);
export const getInternalEvent = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = await InternalEventModel.findById(req.params.id).populate({
      path: "sharedWith",
      select: "-__v -passwordChangedAt",
    });
    if (!user) {
      return next(new AppError("No Internal event found with that id", 404));
    }
    res.status(200).json({
      status: "success",
      data: { user },
    });
  }
);

function normalizeToScheduleXFormat(datetime: string): string {
  try {
    const parsed = parseISO(datetime);
    return format(parsed, "yyyy-MM-dd HH:mm");
  } catch {
    return datetime;
  }
}

export function generateSlotForTimeRange(start: Date, workerCount: number) {
  const slotEnd = addMinutes(start, 60);

  return {
    title: "Available Slot",
    description: "",
    start: format(start, "yyyy-MM-dd HH:mm"),
    end: format(slotEnd, "yyyy-MM-dd HH:mm"),
    calendarId: "available",
    remainingCapacity: workerCount,
    sharedWith: [],
    visibility: "public",
  };
}

export const deleteInternalEvent = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const event = await InternalEventModel.findById(id);
    if (!event) {
      res.status(404).json({ error: "Internal event not found" });
      return;
    }

    const parsedStart = parseISO(event.start);
    const parsedEnd = parseISO(event.end);
    const normalizedStart = format(parsedStart, "yyyy-MM-dd HH:mm");
    const normalizedEnd = format(parsedEnd, "yyyy-MM-dd HH:mm");

    const workerCount = await UserModel.countDocuments({ role: "worker" });
    const participants = 1 + (event.sharedWith?.length ?? 0);

    const matchingSlot = await SlotModel.findOne({
      calendarId: "available",
      start: normalizedStart,
      end: normalizedEnd,
    });

    if (!matchingSlot) {
      // Slot was fully deleted → regenerate it using helper
      const newSlot = generateSlotForTimeRange(parsedStart, workerCount);
      await SlotModel.create(newSlot);
    } else {
      const newCap = Math.min(
        (matchingSlot.remainingCapacity ?? 0) + participants,
        workerCount
      );

      await SlotModel.findByIdAndUpdate(matchingSlot._id, {
        remainingCapacity: newCap,
        title:
          newCap < workerCount
            ? `Available Slot (${newCap} left)`
            : "Available Slot",
      });
    }

    await InternalEventModel.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Internal event deleted and slot capacity restored.",
    });
  }
);

export const createInternalEvent = catchAsync(
  async (req: Request, res: Response) => {
    const { eventData } = req.body;

    if (
      !eventData ||
      !eventData.start ||
      !eventData.end ||
      !eventData.ownerId
    ) {
      res.status(400).json({ error: "Missing required eventData fields" });
      return;
    }

    // Normalize times
    const normalizedStart = normalizeToScheduleXFormat(eventData.start);
    const normalizedEnd = normalizeToScheduleXFormat(eventData.end);

    // Save internal event
    const newInternalEvent: IInternalEvent =
      await InternalEventModel.create(eventData);

    const totalParticipants = 1 + (eventData.sharedWith?.length ?? 0);

    const overlappingSlots = await SlotModel.find({
      calendarId: "available",
      start: { $lt: normalizedEnd },
      end: { $gt: normalizedStart },
    });

    if (overlappingSlots.length === 0) {
      console.warn(
        "⚠️ No matching slot found for internal event. Skipping capacity update."
      );
    }

    for (const slot of overlappingSlots) {
      const currentCap = slot.remainingCapacity ?? 0;
      const newCap = Math.max(currentCap - totalParticipants, 0);

      if (newCap <= 0) {
        await SlotModel.findByIdAndDelete(slot._id);
      } else {
        await SlotModel.findByIdAndUpdate(slot._id, {
          remainingCapacity: newCap,
          title: "Available Slot",
        });
      }
    }

    res.status(201).json({
      status: "success",
      data: {
        internalEvent: newInternalEvent,
      },
    });
  }
);

async function restoreSlotFromRange(start: Date, participants: number) {
  const normalizedStart = format(start, "yyyy-MM-dd HH:mm");
  const normalizedEnd = format(addMinutes(start, 60), "yyyy-MM-dd HH:mm");
  const workerCount = await UserModel.countDocuments({ role: "worker" });

  const matchingSlot = await SlotModel.findOne({
    calendarId: "available",
    start: normalizedStart,
    end: normalizedEnd,
  });

  if (!matchingSlot) {
    const newSlot = generateSlotForTimeRange(start, workerCount);
    await SlotModel.create(newSlot);
  } else {
    const newCap = Math.min(
      (matchingSlot.remainingCapacity ?? 0) + participants,
      workerCount
    );

    await SlotModel.findByIdAndUpdate(matchingSlot._id, {
      remainingCapacity: newCap,
      title:
        newCap < workerCount
          ? `Available Slot (${newCap} left)`
          : "Available Slot",
    });
  }
}

export const updateInternalEvent = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { start, end, sharedWith = [] } = req.body;

    if (!start || !end || !Array.isArray(sharedWith)) {
      return next(new AppError("Missing required fields", 400));
    }

    const internalEventId = req.params.id;
    const previousEvent = await InternalEventModel.findById(internalEventId);

    if (!previousEvent) {
      return next(new AppError("No internal event found with that id", 404));
    }

    // 1️⃣ Check for overlaps
    const overlappingEvents = await InternalEventModel.find({
      _id: { $ne: internalEventId },
      sharedWith: { $in: sharedWith },
      $or: [{ start: { $lt: end }, end: { $gt: start } }],
    });

    if (overlappingEvents.length > 0) {
      return next(
        new AppError("One or more workers are not available at this time", 400)
      );
    }

    const totalWorkers = await UserModel.countDocuments({ role: "worker" });
    const previousParticipants = 1 + (previousEvent.sharedWith?.length || 0);
    const currentParticipants = 1 + sharedWith.length;

    const oldStart = parseISO(previousEvent.start);
    const oldEnd = parseISO(previousEvent.end);
    const newStart = parseISO(start);
    const newEnd = parseISO(end);

    // 🔁 Restore freed slots from shortened time range
    let cursor = new Date(oldStart);
    while (isBefore(cursor, oldEnd)) {
      const next = addMinutes(cursor, 60);
      if (isBefore(cursor, newStart) || isAfter(next, newEnd)) {
        await restoreSlotFromRange(cursor, previousParticipants);
      }
      cursor = next;
    }

    // 🆕 Recreate slots that were deleted due to full capacity, now reduced
    let checkCursor = new Date(newStart);
    while (isBefore(checkCursor, newEnd)) {
      const next = addMinutes(checkCursor, 60);
      const formattedStart = format(checkCursor, "yyyy-MM-dd HH:mm");
      const formattedEnd = format(next, "yyyy-MM-dd HH:mm");

      const slotExists = await SlotModel.findOne({
        start: formattedStart,
        end: formattedEnd,
        calendarId: "available",
      });

      if (!slotExists && currentParticipants < totalWorkers) {
        const recreatedSlot = generateSlotForTimeRange(
          checkCursor,
          totalWorkers - currentParticipants
        );
        await SlotModel.create(recreatedSlot);
      }

      checkCursor = next;
    }

    // 3️⃣ Adjust slots for new range
    const normalizedStart = normalizeToScheduleXFormat(start);
    const normalizedEnd = normalizeToScheduleXFormat(end);

    const overlappingSlots = await SlotModel.find({
      calendarId: "available",
      start: { $lt: normalizedEnd },
      end: { $gt: normalizedStart },
    });

    const newCap = Math.max(0, totalWorkers - currentParticipants);

    for (const slot of overlappingSlots) {
      if (newCap <= 0) {
        await SlotModel.findByIdAndDelete(slot._id);
      } else {
        await SlotModel.findByIdAndUpdate(slot._id, {
          remainingCapacity: newCap,
          title:
            newCap < totalWorkers
              ? `Available Slot (${newCap} left)`
              : "Available Slot",
        });
      }
    }

    // 4️⃣ Apply the update
    const updated = await InternalEventModel.findByIdAndUpdate(
      internalEventId,
      req.body,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      status: "success",
      data: { internalEvent: updated },
    });
  }
);
