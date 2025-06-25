import { Request, Response, NextFunction } from "express";
import { InternalEventModel } from "../models/internalEventModel";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/appErrorr";
import mongoose from "mongoose";
import { SlotModel } from "../models/slotsModel";
import { format, parseISO } from "date-fns";
import { UserModel } from "../models/userModel";
import { IInternalEvent } from "../models/internalEventModel";

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

export const updateInternalEvent = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { start, end, sharedWith = [] } = req.body;

    // Validate required fields
    if (!start || !end || !Array.isArray(sharedWith)) {
      return next(new AppError("Missing required fields", 400));
    }

    // Step 1: Check availability for all workers
    const overlappingEvents = await InternalEventModel.find({
      _id: { $ne: req.params.id }, // exclude the event being updated
      sharedWith: { $in: sharedWith },
      $or: [
        { start: { $lt: end }, end: { $gt: start } }, // basic time overlap check
      ],
    });

    if (overlappingEvents.length > 0) {
      return next(
        new AppError("One or more workers are not available at this time", 400)
      );
    }

    // Step 2: Proceed with update
    const internalEvent = await InternalEventModel.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!internalEvent) {
      return next(new AppError("No internal event found with that id", 404));
    }

    res.status(200).json({
      status: "success",
      data: { internalEvent },
    });
  }
);

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

export const deleteInternalEvent = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const event = await InternalEventModel.findById(id);
    if (!event) {
      res.status(404).json({ error: "Internal event not found" });
      return;
    }

    const normalizedStart = normalizeToScheduleXFormat(event.start); // "2025-06-26 08:00"
    const normalizedEnd = normalizeToScheduleXFormat(event.end);

    const workerCount = await UserModel.countDocuments({ role: "worker" });
    const affectedUsersCount = 1 + (event.sharedWith?.length ?? 0);
    const restoredCapacity = Math.min(workerCount, affectedUsersCount);

    const matchingSlot = await SlotModel.findOne({
      calendarId: "available",
      start: normalizedStart,
      end: normalizedEnd,
    });

    if (!matchingSlot) {
      // 🆕 Create missing slot
      await SlotModel.create({
        title:
          restoredCapacity < workerCount
            ? `Available Slot (${workerCount - affectedUsersCount} left)`
            : "Available Slot",
        description: "",
        start: normalizedStart,
        end: normalizedEnd,
        calendarId: "available",
        remainingCapacity: workerCount - affectedUsersCount,
        sharedWith: [],
        visibility: "public",
      });
      console.log("🆕 Slot recreated:", normalizedStart, normalizedEnd);
    } else {
      // 🔁 Update existing slot
      const newCap = Math.min(
        (matchingSlot.remainingCapacity ?? 0) + affectedUsersCount,
        workerCount
      );

      await SlotModel.findByIdAndUpdate(matchingSlot._id, {
        remainingCapacity: newCap,
        title:
          newCap < workerCount
            ? `Available Slot (${newCap} left)`
            : "Available Slot",
      });

      console.log(`🔁 Slot ${matchingSlot._id} capacity restored to ${newCap}`);
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
