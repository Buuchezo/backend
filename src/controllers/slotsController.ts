import { Request, Response, NextFunction } from "express";
import { catchAsync } from "../utils/catchAsync";
import { SlotModel } from "../models/slotsModel";
import { AppError } from "../utils/appErrorr";
import { UserModel } from "../models/userModel";
import { addEventHelper, hasClientDoubleBooked } from "../utils/addEventHelper";
import { convertToSlotModelInput } from "../utils/convertToSlotMode";
import mongoose from "mongoose";
import { updateEventHelperBackend } from "../utils/updateBookedAppointment";
import { parseISO } from "date-fns";
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

export const createAppointment = catchAsync(
  async (req: Request, res: Response) => {
    console.log("✅ createAppointment route hit");

    const { eventData, userId, lastAssignedIndex } = req.body;

    const user = await UserModel.findById(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const workers = await UserModel.find({ role: "worker" });
    const events = (await SlotModel.find({}).lean()).map((event) => ({
      ...event,
      clientId: event.clientId?.toString(),
    })); // Consider filtering for relevant date range for performance

    // PRE-CHECK: Block duplicate booking by same user/client in overlapping timeslot
    const clientId = eventData.clientId?.toString() ?? user._id.toString();

    const isAlreadyBooked = hasClientDoubleBooked({
      events,
      start: eventData.start,
      end: eventData.end,
      clientId,
      clientName: eventData.clientName,
    });
    console.log("It´s already booked by the " + user + " " + isAlreadyBooked);
    if (isAlreadyBooked) {
      res
        .status(409)
        .json({ error: "User is already booked for this time slot." });
      return;
    }

    // Proceed to book
    const result = addEventHelper({
      eventData,
      events,
      user,
      workers,
      lastAssignedIndex: lastAssignedIndex || 0,
    });

    if (!result) {
      res
        .status(400)
        .json({ error: "All workers are booked for this time slot." });
      return;
    }

    const dbReadyEvent = convertToSlotModelInput(result.newEvent);
    const savedEvent = await SlotModel.create(dbReadyEvent);

    res.status(201).json({
      success: true,
      event: {
        ...result.newEvent,
        id: savedEvent._id.toString(),
        _id: savedEvent._id.toString(),
      },
      lastAssignedIndex: result.lastAssignedIndex,
    });
  }
);

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

// export const updateSlot = catchAsync(
//   async (req: Request, res: Response, next: NextFunction) => {
//     const slotId = req.params.id;

//     // If middleware ran, use its values
//     const updatedSlotFromMiddleware = res.locals.updatedSlot;
//     const bookedSlotFromMiddleware = res.locals.bookedSlot;

//     // If middleware didn't run, fallback to client payload
//     const appointment = bookedSlotFromMiddleware || req.body.eventData;
//     if (!appointment) {
//       return next(
//         new AppError("Missing appointment data in request body", 400)
//       );
//     }

//     // Ensure no _id is used in creation
//     if ("_id" in appointment) {
//       delete appointment._id;
//     }

//     // 1. Update the original available slot (if not already done by middleware)
//     let updatedSlot = updatedSlotFromMiddleware;
//     if (!updatedSlotFromMiddleware) {
//       const slot = await SlotModel.findById(slotId);
//       if (!slot) {
//         return next(new AppError("No slot found with that id", 404));
//       }

//       if ((slot.remainingCapacity ?? 1) <= 1) {
//         await SlotModel.findByIdAndDelete(slotId);
//       } else {
//         updatedSlot = await SlotModel.findByIdAndUpdate(
//           slotId,
//           { $inc: { remainingCapacity: -1 } },
//           { new: true }
//         );
//       }
//     }

//     // 2. Create the booked appointment (if not already done by middleware)
//     const newAppointment =
//       bookedSlotFromMiddleware ||
//       (await SlotModel.create({
//         ...appointment,
//         calendarId: "booked",
//       }));

//     res.status(200).json({
//       status: "success",
//       data: {
//         appointment: newAppointment,
//         updatedSlot,
//       },
//     });
//   }
// );

export const updateAppointment = catchAsync(async (req, res) => {
  const { eventData } = req.body;

  const workers = await UserModel.find({ role: "worker" });
  const events = await SlotModel.find({});

  try {
    const { updatedEvents, updatedAppointment, slotsToInsert } =
      updateEventHelperBackend({
        eventData,
        events,
        workers,
      });

    // 🧹 Delete overlapping available slots ONLY
    await SlotModel.deleteMany({
      start: { $lt: parseISO(eventData.end) },
      end: { $gt: parseISO(eventData.start) },
      calendarId: "available",
    });

    // 🔁 Update the modified appointment
    await SlotModel.findByIdAndUpdate(
      updatedAppointment._id,
      updatedAppointment,
      { new: true }
    );

    // ➕ Insert new available slots (from gaps)
    if (slotsToInsert?.length) {
      for (const slot of slotsToInsert) {
        // Ensure slot doesn't already exist
        const exists = await SlotModel.findOne({
          start: slot.start,
          end: slot.end,
          calendarId: "available",
        });

        if (!exists) {
          await SlotModel.create(slot);
        }
      }
    }

    res.status(200).json({
      success: true,
      updatedEvent: updatedAppointment,
    });
    return;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update appointment.";
    res.status(409).json({ error: message });
  }
});

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

// export const deleteAppointment = catchAsync(async (req, res) => {
//   const eventId = req.params.id;
//   console.log("🗑️ Deleting appointment with ID:", eventId);

//   const deletedEvent = await SlotModel.findByIdAndDelete(eventId);
//   if (!deletedEvent) {
//     res.status(404).json({ error: "Appointment not found" });
//     return;
//   }

//   const { start, end } = deletedEvent;

//   // Get current number of workers (used as max capacity for slots)
//   const workers = await UserModel.find({ role: "worker" });
//   const workerCount = workers.length;

//   // Find matching available slot
//   const existingAvailable = await SlotModel.findOne({
//     start,
//     end,
//     calendarId: "available",
//   });

//   if (existingAvailable) {
//     const current = existingAvailable.remainingCapacity ?? 0;

//     // Ensure we don't exceed the original max capacity
//     existingAvailable.remainingCapacity = Math.min(current + 1, workerCount);
//     await existingAvailable.save();
//   } else {
//     // If no existing slot, recreate a new available slot with 1 capacity
//     await SlotModel.create({
//       title: "Available Slot",
//       start,
//       end,
//       calendarId: "available",
//       remainingCapacity: 1,
//     });
//   }

//   res.status(200).json({ success: true });
// });

export const deleteAppointment = catchAsync(async (req, res) => {
  const eventId = req.params.id;
  console.log("🗑️ Deleting appointment with ID:", eventId);

  // 1. Delete the booked appointment
  const deletedEvent = await SlotModel.findByIdAndDelete(eventId);
  if (!deletedEvent) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  const { start, end } = deletedEvent;

  // 2. Fetch all workers to determine max capacity
  const workers = await UserModel.find({ role: "worker" });
  const workerCount = workers.length;

  // 3. Check for existing exact-match available slot
  const existingExact = await SlotModel.findOne({
    start,
    end,
    calendarId: "available",
  });

  if (existingExact) {
    // ✅ Exact slot already exists — just increase capacity
    const current = existingExact.remainingCapacity ?? 0;
    existingExact.remainingCapacity = Math.min(current + 1, workerCount);
    await existingExact.save();
    res.status(200).json({ success: true });
    return;
  }

  // 4. Check for overlapping available slot (e.g., due to prior reschedule logic)
  const overlappingAvailable = await SlotModel.findOne({
    calendarId: "available",
    start: { $lt: end },
    end: { $gt: start },
  });

  if (overlappingAvailable) {
    console.log(
      "🛑 Skipping slot creation: overlapping available slot already exists."
    );
    res.status(200).json({ success: true });
    return;
  }

  // 5. No exact or overlapping slot — create new available slot
  await SlotModel.create({
    title: "Available Slot",
    start,
    end,
    calendarId: "available",
    remainingCapacity: 1,
  });

  res.status(200).json({ success: true });
  return;
});
