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
import { reassignAppointmentsHelper } from "../utils/reassignWorker";
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

    // Update the related available slot's capacity (if still present)
    const updatedSlot = result.updatedEvents.find(
      (e) =>
        e.title === "Available Slot" &&
        e.start === result.newEvent.start &&
        e.end === result.newEvent.end
    );

    if (
      updatedSlot &&
      updatedSlot._id &&
      typeof updatedSlot.remainingCapacity === "number"
    ) {
      if (updatedSlot.remainingCapacity <= 0) {
        await SlotModel.findByIdAndDelete(updatedSlot._id);
      } else {
        await SlotModel.findByIdAndUpdate(
          updatedSlot._id,
          {
            remainingCapacity: updatedSlot.remainingCapacity,
            title: `Available Slot (${updatedSlot.remainingCapacity} left)`,
          },
          { new: true }
        );
      }
    }

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

// export const updateAppointment = catchAsync(async (req, res) => {
//   const { eventData } = req.body;

//   const workers = await UserModel.find({ role: "worker" });
//   const events = await SlotModel.find({});

//   try {
//     const { updatedEvents, updatedAppointment, slotsToInsert } =
//       updateEventHelperBackend({
//         eventData,
//         events,
//         workers,
//       });

//     // 🧹 Delete overlapping available slots ONLY
//     await SlotModel.deleteMany({
//       start: { $lt: parseISO(eventData.end) },
//       end: { $gt: parseISO(eventData.start) },
//       calendarId: "available",
//     });

//     //  Update the modified appointment
//     await SlotModel.findByIdAndUpdate(
//       updatedAppointment._id,
//       updatedAppointment,
//       { new: true }
//     );

//     //  Insert new available slots (from gaps)
//     if (slotsToInsert?.length) {
//       for (const slot of slotsToInsert) {
//         // Ensure slot doesn't already exist
//         const exists = await SlotModel.findOne({
//           start: slot.start,
//           end: slot.end,
//           calendarId: "available",
//         });

//         if (!exists) {
//           await SlotModel.create(slot);
//         }
//       }
//     }

//     res.status(200).json({
//       success: true,
//       updatedEvent: updatedAppointment,
//     });
//     return;
//   } catch (error) {
//     const message =
//       error instanceof Error ? error.message : "Failed to update appointment.";
//     res.status(409).json({ error: message });
//   }
// });

///////
// export const updateAppointment = catchAsync(async (req, res) => {
//   const { eventData } = req.body;

//   const workers = await UserModel.find({ role: "worker" });
//   const events = await SlotModel.find({});

//   try {
//     const { updatedEvents, updatedAppointment, slotsToInsert } =
//       updateEventHelperBackend({
//         eventData,
//         events,
//         workers,
//       });

//     // 🧼 Ensure appointment exists
//     const appointmentExists = await SlotModel.findById(updatedAppointment._id);
//     if (!appointmentExists) {
//       res.status(404).json({ error: "Appointment not found." });
//       return;
//     }

//     // 🧹 Delete overlapping slots
//     await SlotModel.deleteMany({
//       start: { $lt: parseISO(eventData.end) },
//       end: { $gt: parseISO(eventData.start) },
//       calendarId: "available",
//     });

//     // 🛠 Update appointment
//     await SlotModel.findByIdAndUpdate(
//       updatedAppointment._id,
//       updatedAppointment,
//       { new: true }
//     );

//     // ➕ Insert new slots if needed
//     if (slotsToInsert?.length) {
//       const insertPromises = slotsToInsert.map(async (slot) => {
//         const exists = await SlotModel.findOne({
//           start: slot.start,
//           end: slot.end,
//           calendarId: "available",
//         });

//         if (!exists) {
//           return SlotModel.create(slot);
//         }
//       });

//       await Promise.all(insertPromises);
//     }

//     res.status(200).json({
//       success: true,
//       updatedEvent: updatedAppointment,
//     });
//   } catch (error) {
//     const message =
//       error instanceof Error ? error.message : "Failed to update appointment.";
//     res.status(409).json({ error: message });
//   }

//////

export const updateAppointment = catchAsync(async (req, res) => {
  const { eventData } = req.body;

  const workers = await UserModel.find({ role: "worker" });
  const events = await SlotModel.find({});

  try {
    const { updatedEvents, updatedAppointment, slotsToInsert, slotsToUpdate } =
      updateEventHelperBackend({
        eventData,
        events,
        workers,
      });

    // ⬇️ Update slot capacities
    if (slotsToUpdate?.length) {
      for (const slot of slotsToUpdate) {
        if (!slot._id) continue;

        if (typeof slot.remainingCapacity !== "number") continue; // ✅ Safeguard

        if (slot.remainingCapacity <= 0) {
          await SlotModel.findByIdAndDelete(slot._id);
        } else {
          await SlotModel.findByIdAndUpdate(
            slot._id,
            {
              remainingCapacity: slot.remainingCapacity,
              title: `Available Slot (${slot.remainingCapacity} left)`,
            },
            { new: true }
          );
        }
      }
    }

    // 🧼 Ensure appointment exists
    const appointmentExists = await SlotModel.findById(updatedAppointment._id);
    if (!appointmentExists) {
      res.status(404).json({ error: "Appointment not found." });
      return;
    }

    // 🧹 Delete overlapping available slots within the new range
    await SlotModel.deleteMany({
      start: { $lt: parseISO(eventData.end) },
      end: { $gt: parseISO(eventData.start) },
      calendarId: "available",
    });

    // 🛠 Update the appointment details
    await SlotModel.findByIdAndUpdate(
      updatedAppointment._id,
      updatedAppointment,
      { new: true }
    );

    // ➕ Insert new available slots if needed
    if (slotsToInsert?.length) {
      const insertPromises = slotsToInsert.map(async (slot) => {
        const exists = await SlotModel.findOne({
          start: slot.start,
          end: slot.end,
          calendarId: "available",
        });

        if (!exists) {
          return SlotModel.create(slot);
        }
      });

      await Promise.all(insertPromises);
    }

    // 💾 Update remainingCapacity on existing overlapping available slots
    if (updatedEvents?.length) {
      const updatePromises = updatedEvents
        .filter((e) => e.title === "Available Slot" && e._id)
        .map((slot) =>
          SlotModel.findByIdAndUpdate(slot._id, {
            remainingCapacity: slot.remainingCapacity,
          })
        );

      await Promise.all(updatePromises);
    }

    // ✅ Success response
    res.status(200).json({
      success: true,
      updatedEvent: updatedAppointment,
    });
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

export const deleteAppointment = catchAsync(async (req, res) => {
  const eventId = req.params.id;

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
    //  Exact slot already exists — just increase capacity
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

export const markWorkerSick = catchAsync(async (req, res) => {
  const { workerId } = req.body;
  if (!workerId) {
    res.status(400).json({ error: "Missing workerId" });
    return;
  }

  try {
    await reassignAppointmentsHelper(workerId);
    res
      .status(200)
      .json({ success: true, message: "Appointments reassigned." });
  } catch (error) {
    console.error(" Error in reassignAppointmentsHelper:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});
