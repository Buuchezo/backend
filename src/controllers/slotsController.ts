import { Request, Response, NextFunction } from "express";
import { catchAsync } from "../utils/catchAsync";
import { ISlot, SlotModel } from "../models/slotsModel";
import { AppError } from "../utils/appErrorr";
import { UserModel } from "../models/userModel";
import {
  addEventHelper,
  hasClientDoubleBooked,
  normalizeToScheduleXFormat,
} from "../utils/addEventHelper";
import { convertToSlotModelInput } from "../utils/convertToSlotMode";
import mongoose from "mongoose";
import { updateEventHelperBackend } from "../utils/updateBookedAppointment";
import { parseISO } from "date-fns";
import { reassignAppointmentsHelper } from "../utils/reassignWorker";
import { restoreSlotCapacities } from "../utils/restoreSlotCapacities";
import { CalendarEventInput } from "../app";
type SanitizedQuery = Record<string, string | string[] | undefined>;

function createAvailableSlot({
  start,
  end,
  workerCount,
}: {
  start: string;
  end: string;
  workerCount: number;
}): Partial<ISlot> {
  const id = new mongoose.Types.ObjectId();

  return {
    _id: id,
    title: `Available Slot (${workerCount} left)`,
    start,
    end,
    calendarId: "available",
    remainingCapacity: workerCount,
    description: "",
  };
}

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
    const { eventData, userId, lastAssignedIndex = 0 } = req.body;

    const user = await UserModel.findById(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const workers = await UserModel.find({ role: "worker" });

    const rawEvents = await SlotModel.find({}).lean();

    const events = rawEvents.map((event) => ({
      ...event,
      clientId: event.clientId?.toString(),
      ownerId: event.ownerId?.toString(),
      _id: event._id,
    }));

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

    const result = addEventHelper({
      eventData,
      events,
      user,
      workers,
      lastAssignedIndex,
    });

    if (!result) {
      res
        .status(400)
        .json({ error: "All workers are booked for this time slot." });
      return;
    }

    // Save the new appointment to DB
    const dbReadyEvent = convertToSlotModelInput(result.newEvent);
    const savedEvent = await SlotModel.create(dbReadyEvent);

    // Update the original slot if slotUpdate is returned
    if (result.slotUpdate) {
      const { slotId, newCapacity, calendarId, title } = result.slotUpdate;
      await SlotModel.findByIdAndUpdate(slotId, {
        remainingCapacity: newCapacity,
        calendarId,
        title,
      });
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
    return;
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

// });

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

  const deletedEvent = await SlotModel.findByIdAndDelete(eventId);
  if (!deletedEvent) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  const { start, end, reducedSlotIds } = deletedEvent;

  // 🔁 Restore previously reduced slots if any
  if (Array.isArray(reducedSlotIds) && reducedSlotIds.length > 0) {
    const idsAsStrings = reducedSlotIds.map((id) => id.toString());
    await restoreSlotCapacities(idsAsStrings);
    res.status(200).json({ success: true });
    return;
  }

  // 📊 Get system max capacity (typically number of workers)
  const workers = await UserModel.find({ role: "worker" });
  const maxCapacity = workers.length;

  // 🔍 Find overlapping slot that was either "fully booked" or "available"
  const overlappingSlot = await SlotModel.findOne({
    start: { $lt: end },
    end: { $gt: start },
    calendarId: { $in: ["available", "fully booked"] },
  });

  if (overlappingSlot) {
    // 🔼 Increase capacity
    overlappingSlot.remainingCapacity = Math.min(
      (overlappingSlot.remainingCapacity ?? 0) + 1,
      maxCapacity
    );

    // 🔁 Convert from fully booked to available if needed
    if (overlappingSlot.calendarId === "fully booked") {
      overlappingSlot.calendarId = "available";
    }

    // ✏️ Update title accordingly
    const cap = overlappingSlot.remainingCapacity;
    overlappingSlot.title =
      cap <= 1 ? "Available Slot" : `Available Slot (${cap} left)`;

    await overlappingSlot.save();
    res.status(200).json({ success: true });
    return;
  }

  // 🆕 No slot existed — recreate a new one with 1 capacity
  await SlotModel.create({
    title: "Available Slot (1 left)",
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

export const updateAppointment = catchAsync(async (req, res) => {
  const { eventData } = req.body;

  const workers = await UserModel.find({ role: "worker" });
  const MAX_WORKER_CAPACITY = workers.length;

  const events = await SlotModel.find({});

  try {
    const {
      updatedEvents,
      updatedAppointment,
      slotsToInsert,
      slotsToUpdate,
      groupedOverlappingIds,
      originalAppointment,
    } = updateEventHelperBackend({
      eventData,
      events,
      workers,
    });

    const updatedId = updatedAppointment._id?.toString();
    if (!updatedId) {
      res.status(400).json({ error: "Missing appointment ID" });
      return;
    }

    const originalStart = parseISO(originalAppointment.start);
    const originalEnd = parseISO(originalAppointment.end);
    const updatedStart = parseISO(updatedAppointment.start);
    const updatedEnd = parseISO(updatedAppointment.end);

    console.log(
      "🟡 ORIGINAL RANGE:",
      originalStart.toISOString(),
      originalEnd.toISOString()
    );
    console.log(
      "🟢 UPDATED RANGE:",
      updatedStart.toISOString(),
      updatedEnd.toISOString()
    );

    // Handle overlapping capacity updates
    for (const group of groupedOverlappingIds) {
      for (const id of group) {
        if (id === updatedId) continue;

        const slot = await SlotModel.findById(id);
        if (!slot || typeof slot.remainingCapacity !== "number") continue;

        const slotStart = parseISO(slot.start);
        const slotEnd = parseISO(slot.end);

        const wasInOriginal =
          slotStart < originalEnd && slotEnd > originalStart;
        const isInUpdated = slotStart < updatedEnd && slotEnd > updatedStart;

        console.log(`🔄 Slot [${slot._id}]`, {
          start: slot.start,
          end: slot.end,
          wasInOriginal,
          isInUpdated,
          remainingCapacity: slot.remainingCapacity,
        });

        const currentCap = slot.remainingCapacity;

        if (wasInOriginal && !isInUpdated) {
          const restoredCap = Math.min(currentCap + 1, MAX_WORKER_CAPACITY);
          const newTitle =
            restoredCap >= MAX_WORKER_CAPACITY
              ? "Available Slot"
              : `Available Slot (${restoredCap} left)`;

          console.log(
            `✅ Restoring slot ${slot._id} to capacity: ${restoredCap}`
          );
          await SlotModel.findByIdAndUpdate(slot._id, {
            remainingCapacity: restoredCap,
            calendarId: "available",
            title: newTitle,
          });
        }

        if (!wasInOriginal && isInUpdated) {
          const reducedCap = Math.max(currentCap - 1, 0);
          const isNowFullyBooked = reducedCap <= 0;

          console.log(
            `❌ Reducing slot ${slot._id} to capacity: ${reducedCap}`
          );
          await SlotModel.findByIdAndUpdate(slot._id, {
            remainingCapacity: reducedCap,
            calendarId: isNowFullyBooked ? "fully booked" : "available",
            title: isNowFullyBooked
              ? "Fully Booked Slot"
              : `Available Slot (${reducedCap} left)`,
          });
        }
      }
    }

    // ✅ Restore slots that are no longer in the updated range
    console.log(
      "🔍 Finding slots to recover between updatedEnd and originalEnd"
    );
    const allSlots = await SlotModel.find({});
    const slotsToRestore = allSlots.filter(
      (slot): slot is typeof slot & { remainingCapacity: number } => {
        const slotStart = parseISO(slot.start);
        const slotEnd = parseISO(slot.end);

        const isOverlappingRemovedRange =
          slotEnd > updatedEnd &&
          slotStart < originalEnd &&
          slotStart >= updatedEnd;

        return (
          isOverlappingRemovedRange &&
          typeof slot.remainingCapacity === "number" &&
          slot.remainingCapacity < MAX_WORKER_CAPACITY
        );
      }
    );

    console.log(`📦 Found ${slotsToRestore.length} slots in reduced window`);
    for (const slot of slotsToRestore) {
      const restoredCap = Math.min(
        slot.remainingCapacity + 1,
        MAX_WORKER_CAPACITY
      );
      const newTitle =
        restoredCap >= MAX_WORKER_CAPACITY
          ? "Available Slot"
          : `Available Slot (${restoredCap} left)`;

      console.log(
        `♻️ Restoring cut-off slot ${slot._id} to capacity: ${restoredCap}`
      );
      await SlotModel.findByIdAndUpdate(slot._id, {
        remainingCapacity: restoredCap,
        calendarId: "available",
        title: newTitle,
      });
    }

    // Update modified slots
    if (slotsToUpdate?.length) {
      console.log(`🛠️ Updating ${slotsToUpdate.length} modified slots`);
      for (const slot of slotsToUpdate) {
        if (!slot._id) continue;

        await SlotModel.findByIdAndUpdate(slot._id, {
          remainingCapacity: slot.remainingCapacity,
          title: slot.title,
          calendarId: slot.calendarId,
        });
      }
    }

    // Delete stale slots that are fully open and unused
    console.log("🧹 Deleting unused full-capacity slots in updated range");
    await SlotModel.deleteMany({
      start: { $lt: parseISO(eventData.end) },
      end: { $gt: parseISO(eventData.start) },
      calendarId: "available",
      remainingCapacity: MAX_WORKER_CAPACITY,
    });

    // Update the main appointment
    console.log(`✏️ Updating appointment ${updatedAppointment._id}`);
    await SlotModel.findByIdAndUpdate(
      updatedAppointment._id,
      updatedAppointment,
      { new: true }
    );

    // Insert new slots
    if (slotsToInsert?.length) {
      console.log(`➕ Inserting ${slotsToInsert.length} new slots`);
      const insertPromises = slotsToInsert.map(async (slot) => {
        const exists = await SlotModel.findOne({
          start: slot.start,
          end: slot.end,
          calendarId: slot.calendarId,
        });

        if (!exists) {
          console.log(
            `📌 Creating slot ${slot.title} from ${slot.start}–${slot.end}`
          );
          return SlotModel.create(slot);
        }

        return null;
      });

      await Promise.all(insertPromises);
    }

    res.status(200).json({
      success: true,
      updatedEvent: updatedAppointment,
      groupedOverlappingIds,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update appointment.";
    console.error("❗ Error during update:", message);
    res.status(409).json({ error: message });
  }
});
