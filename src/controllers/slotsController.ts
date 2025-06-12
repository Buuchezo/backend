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

    // If middleware ran, use its values
    const updatedSlotFromMiddleware = res.locals.updatedSlot;
    const bookedSlotFromMiddleware = res.locals.bookedSlot;

    // If middleware didn't run, fallback to client payload
    const appointment = bookedSlotFromMiddleware || req.body.eventData;
    if (!appointment) {
      return next(
        new AppError("Missing appointment data in request body", 400)
      );
    }

    // Ensure no _id is used in creation
    if ("_id" in appointment) {
      delete appointment._id;
    }

    // 1. Update the original available slot (if not already done by middleware)
    let updatedSlot = updatedSlotFromMiddleware;
    if (!updatedSlotFromMiddleware) {
      const slot = await SlotModel.findById(slotId);
      if (!slot) {
        return next(new AppError("No slot found with that id", 404));
      }

      if ((slot.remainingCapacity ?? 1) <= 1) {
        await SlotModel.findByIdAndDelete(slotId);
      } else {
        updatedSlot = await SlotModel.findByIdAndUpdate(
          slotId,
          { $inc: { remainingCapacity: -1 } },
          { new: true }
        );
      }
    }

    // 2. Create the booked appointment (if not already done by middleware)
    const newAppointment =
      bookedSlotFromMiddleware ||
      (await SlotModel.create({
        ...appointment,
        calendarId: "booked",
      }));

    res.status(200).json({
      status: "success",
      data: {
        appointment: newAppointment,
        updatedSlot,
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
