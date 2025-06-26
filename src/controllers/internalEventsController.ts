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

// export const updateInternalEvent = catchAsync(
//   async (req: Request, res: Response, next: NextFunction) => {
//     const { start, end, sharedWith = [] } = req.body;

//     if (!start || !end || !Array.isArray(sharedWith)) {
//       return next(new AppError("Missing required fields", 400));
//     }

//     const internalEventId = req.params.id;

//     // 1️⃣ Check for overlapping internal events
//     const overlappingEvents = await InternalEventModel.find({
//       _id: { $ne: internalEventId },
//       sharedWith: { $in: sharedWith },
//       $or: [{ start: { $lt: end }, end: { $gt: start } }],
//     });

//     if (overlappingEvents.length > 0) {
//       return next(
//         new AppError("One or more workers are not available at this time", 400)
//       );
//     }

//     // 2️⃣ Normalize time
//     const normalizedStart = normalizeToScheduleXFormat(start);
//     const normalizedEnd = normalizeToScheduleXFormat(end);

//     // 3️⃣ Find all overlapping public slots
//     const overlappingSlots = await SlotModel.find({
//       calendarId: "available",
//       start: { $lt: normalizedEnd },
//       end: { $gt: normalizedStart },
//     });

//     const overlappingSlotIds = overlappingSlots.map((slot) =>
//       slot._id.toString()
//     );
//     console.log("🧩 Overlapping slot IDs:", overlappingSlotIds);

//     // 4️⃣ Count participants (owner + sharedWith)
//     const participantCount = 1 + sharedWith.length;

//     // 5️⃣ Fetch total worker count
//     const totalWorkers = await UserModel.countDocuments({ role: "worker" });

//     // 6️⃣ Adjust slots
//     for (const slot of overlappingSlots) {
//       const currentCap = slot.remainingCapacity ?? totalWorkers;
//       const newCap = Math.max(0, totalWorkers - participantCount);

//       if (newCap <= 0) {
//         await SlotModel.findByIdAndDelete(slot._id);
//         console.log(`❌ Slot ${slot._id} deleted`);
//       } else {
//         await SlotModel.findByIdAndUpdate(slot._id, {
//           remainingCapacity: newCap,
//           title: "Available Slot",
//         });
//         console.log(`🔄 Slot ${slot._id} capacity updated to ${newCap}`);
//       }
//     }

//     // 7️⃣ Update the internal event
//     const internalEvent = await InternalEventModel.findByIdAndUpdate(
//       internalEventId,
//       req.body,
//       { new: true, runValidators: true }
//     );

//     if (!internalEvent) {
//       return next(new AppError("No internal event found with that id", 404));
//     }

//     res.status(200).json({
//       status: "success",
//       data: {
//         internalEvent,
//         overlappingSlotIds,
//       },
//     });
//   }
// );

export const updateInternalEvent = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { start, end, sharedWith = [] } = req.body;

    if (!start || !end || !Array.isArray(sharedWith)) {
      return next(new AppError("Missing required fields", 400));
    }

    const internalEventId = req.params.id;

    // 1️⃣ Check for conflicts
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

    // 2️⃣ Get original event
    const originalEvent = await InternalEventModel.findById(internalEventId);
    if (!originalEvent) {
      return next(new AppError("Original event not found", 404));
    }

    // 3️⃣ Normalize time
    const normalizedNewStart = normalizeToScheduleXFormat(start);
    const normalizedNewEnd = normalizeToScheduleXFormat(end);
    const normalizedOldStart = normalizeToScheduleXFormat(originalEvent.start);
    const normalizedOldEnd = normalizeToScheduleXFormat(originalEvent.end);

    // 4️⃣ Fetch total worker count
    const totalWorkers = await UserModel.countDocuments({ role: "worker" });

    // 5️⃣ Get all possibly affected slots
    const affectedSlots = await SlotModel.find({
      calendarId: "available",
      $or: [
        {
          start: { $lt: normalizedOldEnd },
          end: { $gt: normalizedOldStart },
        },
        {
          start: { $lt: normalizedNewEnd },
          end: { $gt: normalizedNewStart },
        },
      ],
    });

    // 6️⃣ Participants before and after
    const oldParticipants = 1 + (originalEvent.sharedWith?.length ?? 0);
    const newParticipants = 1 + sharedWith.length;

    for (const slot of affectedSlots) {
      const slotStart = parseISO(slot.start);
      const slotEnd = parseISO(slot.end);

      const wasInOld =
        slotStart < parseISO(normalizedOldEnd) &&
        slotEnd > parseISO(normalizedOldStart);
      const isInNew =
        slotStart < parseISO(normalizedNewEnd) &&
        slotEnd > parseISO(normalizedNewStart);

      if (wasInOld && !isInNew) {
        // 🔁 Restore
        const restoredCap = Math.min(
          (slot.remainingCapacity ?? 0) + oldParticipants,
          totalWorkers
        );
        await SlotModel.findByIdAndUpdate(slot._id, {
          remainingCapacity: restoredCap,
          title: "Available Slot",
        });
        console.log(`🔁 Restored slot ${slot._id} to ${restoredCap}`);
      }

      if (!wasInOld && isInNew) {
        // ➖ Reduce
        const reducedCap = Math.max(
          (slot.remainingCapacity ?? totalWorkers) - newParticipants,
          0
        );
        if (reducedCap <= 0) {
          await SlotModel.findByIdAndDelete(slot._id);
          console.log(`❌ Deleted slot ${slot._id}`);
        } else {
          await SlotModel.findByIdAndUpdate(slot._id, {
            remainingCapacity: reducedCap,
            title: "Available Slot",
          });
          console.log(`➖ Reduced slot ${slot._id} to ${reducedCap}`);
        }
      }
    }

    // 7️⃣ Update internal event
    const internalEvent = await InternalEventModel.findByIdAndUpdate(
      internalEventId,
      req.body,
      { new: true, runValidators: true }
    );

    if (!internalEvent) {
      return next(new AppError("No internal event found after update", 404));
    }

    res.status(200).json({
      status: "success",
      data: {
        internalEvent,
      },
    });
  }
);
