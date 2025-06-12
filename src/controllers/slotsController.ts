import { Request, Response, NextFunction } from "express";
import { catchAsync } from "../utils/catchAsync";
import { SlotModel } from "../models/slotsModel";
import { AppError } from "../utils/appErrorr";
type SanitizedQuery = Record<string, string | string[] | undefined>;

export const createSlots = catchAsync(async (req: Request, res: Response) => {
  const slots = req.body.slots;

  if (!Array.isArray(slots) || slots.length === 0) {
    res.status(400).json({ message: "No appointment slots to create." });
    return;
  }

  const insertedSlots = await SlotModel.insertMany(slots);

  res.status(201).json({
    status: "success",
    message: `${insertedSlots.length} slots created.`,
    data: insertedSlots,
  });
});

export const getSlot = catchAsync(
  async (
    req: Request & { sanitizedQuery?: SanitizedQuery },
    res: Response,
    next: NextFunction
  ) => {
    const slot = await SlotModel.findById(req.params.id);
    if (!slot) {
      return next(new AppError("No slot found with that id", 404));
    }
    res.status(200).json({
      status: "success",
      data: {
        slot,
      },
    });
  }
);

export const updateSlot = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const slotId = req.params.id;

    const updatedFromMiddleware = res.locals.updatedAppointment;

    const eventData = updatedFromMiddleware || req.body.eventData;

    if (!eventData) {
      return next(new AppError("Missing eventData in request body", 400));
    }

    // Attempt to replace slot with new data
    const updatedSlot = await SlotModel.findByIdAndUpdate(
      slotId,
      {
        ...eventData,
      },
      {
        new: true,
        runValidators: true,
        overwrite: true, // 👈 ensures full replacement like PUT
      }
    );

    if (!updatedSlot) {
      return next(new AppError("No slot found with that id", 404));
    }

    res.status(200).json({
      status: "success",
      data: {
        appointment: updatedSlot,
      },
    });
  }
);

export const getSlots = catchAsync(
  async (
    req: Request & { sanitizedQuery?: SanitizedQuery },
    res: Response,
    next: NextFunction
  ) => {
    const slot = await SlotModel.find();
    if (!slot) {
      return next(new AppError("No slots found with that id", 404));
    }
    res.status(200).json({
      status: "success",
      data: {
        slot,
      },
    });
  }
);
