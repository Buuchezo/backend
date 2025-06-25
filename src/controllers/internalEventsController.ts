import { Request, Response, NextFunction } from "express";
import { InternalEventModel } from "../models/internalEventModel";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/appErrorr";
import mongoose from "mongoose";
import { SlotModel } from "../models/slotsModel";
import { format, parseISO } from "date-fns";

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

export const deleteInternalEvent = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const internalEvent = await InternalEventModel.findByIdAndDelete(
      req.params.id
    );
    if (!internalEvent) {
      return next(new AppError("No internal event found with that id", 404));
    }
    res.status(204).json({
      status: "success",
    });
  }
);

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

export const createInternalEvent = catchAsync(
  async (req: Request, res: Response) => {
    const { eventData } = req.body;

    if (!eventData?.start || !eventData?.end) {
      res.status(400).json({ error: "Missing start or end time" });
      return;
    }

    // Normalize the times
    const normalizedStart = normalizeToScheduleXFormat(eventData.start);
    const normalizedEnd = normalizeToScheduleXFormat(eventData.end);

    // Save the internal event
    const newInternalEvent = await InternalEventModel.create({
      ...eventData,
      start: normalizedStart,
      end: normalizedEnd,
    });

    // Find generated slot(s) that overlap by time
    const matchingSlots = await SlotModel.find({
      calendarId: "available",
      start: { $lt: normalizedEnd },
      end: { $gt: normalizedStart },
    });

    for (const slot of matchingSlots) {
      if (typeof slot.remainingCapacity !== "number") continue;

      const newCap = Math.max(slot.remainingCapacity - 1, 0);

      if (newCap <= 0) {
        await SlotModel.findByIdAndDelete(slot._id);
      } else {
        await SlotModel.findByIdAndUpdate(slot._id, {
          remainingCapacity: newCap,
          title: "Available Slot", // maintain original format
        });
      }
    }

    res.status(201).json({
      status: "success",
      data: {
        internalEvent: newInternalEvent,
        affectedSlots: matchingSlots.map((s) => s._id),
      },
    });
  }
);
