import { Request, Response, NextFunction } from "express";
import { InternalEventModel } from "../models/internalEventModel";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/appErrorr";
import mongoose from "mongoose";
import { SlotModel } from "../models/slotsModel";
import { addMinutes, format, parseISO } from "date-fns";
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

// export const updateInternalEvent = catchAsync(
//   async (req: Request, res: Response, next: NextFunction) => {
//     const { start, end, sharedWith = [] } = req.body;

//     // Validate required fields
//     if (!start || !end || !Array.isArray(sharedWith)) {
//       return next(new AppError("Missing required fields", 400));
//     }

//     // Step 1: Check availability for all workers
//     const overlappingEvents = await InternalEventModel.find({
//       _id: { $ne: req.params.id }, // exclude the event being updated
//       sharedWith: { $in: sharedWith },
//       $or: [
//         { start: { $lt: end }, end: { $gt: start } }, // basic time overlap check
//       ],
//     });

//     if (overlappingEvents.length > 0) {
//       return next(
//         new AppError("One or more workers are not available at this time", 400)
//       );
//     }

//     // Step 2: Proceed with update
//     const internalEvent = await InternalEventModel.findByIdAndUpdate(
//       req.params.id,
//       req.body,
//       {
//         new: true,
//         runValidators: true,
//       }
//     );

//     if (!internalEvent) {
//       return next(new AppError("No internal event found with that id", 404));
//     }

//     res.status(200).json({
//       status: "success",
//       data: { internalEvent },
//     });
//   }
// );

// export const deleteInternalEvent = catchAsync(
//   async (req: Request, res: Response, next: NextFunction) => {
//     const internalEvent = await InternalEventModel.findByIdAndDelete(
//       req.params.id
//     );
//     if (!internalEvent) {
//       return next(new AppError("No internal event found with that id", 404));
//     }
//     res.status(204).json({
//       status: "success",
//     });
//   }
// );

// POST a new internal event
// export const createInternalEvent = catchAsync(
//   async (req: Request, res: Response) => {
//     const { eventData } = req.body;

//     if (!eventData) {
//       res.status(400).json({ error: "Missing eventData in request body" });
//       return;
//     }

//     const newInternalEvent = await InternalEventModel.create(eventData);

//     res.status(201).json({
//       status: "success",
//       data: {
//         internalEvent: newInternalEvent,
//       },
//     });
//   }
// );

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
      console.log("🆕 Slot recreated:", newSlot.start);
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
      console.log(`🔁 Slot ${matchingSlot._id} restored to cap: ${newCap}`);
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
    console.log("✅ Internal event created:", newInternalEvent._id.toString());

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
        console.log(`❌ Deleted slot ${slot._id} due to full capacity.`);
      } else {
        await SlotModel.findByIdAndUpdate(slot._id, {
          remainingCapacity: newCap,
          title: "Available Slot",
        });
        console.log(`➖ Reduced slot ${slot._id} capacity to ${newCap}`);
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

export const updateInternalEvent = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { start, end, sharedWith = [] } = req.body;

    if (!start || !end || !Array.isArray(sharedWith)) {
      return next(new AppError("Missing required fields", 400));
    }

    // Step 1: Check for conflicts
    const overlappingEvents = await InternalEventModel.find({
      _id: { $ne: req.params.id },
      sharedWith: { $in: sharedWith },
      $or: [{ start: { $lt: end }, end: { $gt: start } }],
    });

    if (overlappingEvents.length > 0) {
      return next(
        new AppError("One or more workers are not available at this time", 400)
      );
    }

    // Step 2: Normalize and format times
    const normalizedStart = normalizeToScheduleXFormat(start);
    const normalizedEnd = normalizeToScheduleXFormat(end);

    // Step 3: Fetch overlapping slots
    const overlappingSlots = await SlotModel.find({
      calendarId: "available",
      start: { $lt: normalizedEnd },
      end: { $gt: normalizedStart },
    });

    const overlappingSlotIds = overlappingSlots.map((slot) =>
      slot._id.toString()
    );

    console.log("🧩 Overlapping slot IDs:", overlappingSlotIds);

    // Step 4: Update internal event
    const internalEvent = await InternalEventModel.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!internalEvent) {
      return next(new AppError("No internal event found with that id", 404));
    }

    res.status(200).json({
      status: "success",
      data: {
        internalEvent,
        overlappingSlotIds, // ✅ Include slot IDs in response if needed
      },
    });
  }
);
