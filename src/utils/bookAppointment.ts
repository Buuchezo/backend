import { Request, Response, NextFunction } from "express";
import { parseISO, format, addMinutes } from "date-fns";
import { AppointmentModel } from "../models/appointmentModel";
import { UserModel } from "../models/userModel";
import { CalendarEventInput } from "./generateSlots";
import { User } from "../app";
import { AppError } from "./appErrorr";
import mongoose from "mongoose";
import { SlotModel } from "../models/slotsModel";

function normalizeToScheduleXFormat(datetime: string): string {
  try {
    return format(parseISO(datetime), "yyyy-MM-dd HH:mm");
  } catch {
    return datetime;
  }
}

// export async function bookAppointmentMiddleware(req: Request, res: Response, next: NextFunction) {
//   try {
//     const { eventData } = req.body

//     if (!eventData || !eventData.start || !eventData.end) {
//       return res.status(400).json({ message: 'Missing required event data.' })
//     }

//     const formattedStart = normalizeToScheduleXFormat(eventData.start)
//     const formattedEnd = normalizeToScheduleXFormat(eventData.end)

//     const [events, workers] = await Promise.all([
//       AppointmentModel.find(),
//       UserModel.find({ role: 'worker' }),
//     ])

//     const user =
//       eventData.clientId && typeof eventData.clientId === 'string'
//         ? await UserModel.findById(eventData.clientId)
//         : null

//     const overlapping = events.filter(
//       (e) =>
//         e.title?.startsWith('Booked Appointment') &&
//         parseISO(e.start) < parseISO(formattedEnd) &&
//         parseISO(e.end) > parseISO(formattedStart),
//     )

//     const freeWorker = workers.find(
//       (worker) => !overlapping.some((appt) => appt.ownerId === worker.id),
//     )

//     if (!freeWorker) {
//       // No worker available — delete the slot so it's no longer bookable
//       await AppointmentModel.findOneAndDelete({
//         title: 'Available Slot',
//         start: formattedStart,
//         end: formattedEnd,
//         calendarId: 'available',
//       })

//       return res.status(409).json({ message: 'No available workers for this time slot.' })
//     }

//     // Worker available — update the slot to booked
//     const updated = await AppointmentModel.findOneAndUpdate(
//       {
//         title: 'Available Slot',
//         start: formattedStart,
//         end: formattedEnd,
//         calendarId: 'available',
//       },
//       {
//         $set: {
//           title: `Booked Appointment with ${freeWorker.firstName}`,
//           calendarId: 'booked',
//           description: eventData.description || '',
//           ownerId: freeWorker.id,
//           clientId: eventData.clientId ?? `guest-${Date.now()}`,
//           clientName: eventData.clientName ?? user?.firstName ?? 'Guest',
//         },
//       },
//       { new: true },
//     )

//     if (!updated) {
//       return res.status(404).json({ message: 'Matching available slot not found.' })
//     }

//     req.body.updatedAppointment = updated
//     next()
//   } catch (err) {
//     console.error('Booking error:', err)
//     res.status(500).json({
//       message: err instanceof Error ? err.message : 'Internal server error',
//     })
//   }
// }

export const addEventMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const {
    eventData,
    events,
    user,
    workers,
    lastAssignedIndex,
  }: {
    eventData: CalendarEventInput;
    events?: CalendarEventInput[];
    user: User | null;
    workers: User[];
    lastAssignedIndex: number;
  } = req.body;

  if (!Array.isArray(events)) {
    return next(
      new AppError("Missing or invalid 'events' array in request body", 400)
    );
  }

  const slot = await SlotModel.findById(eventData._id);
  if (!slot || slot.remainingCapacity === undefined) {
    return next(
      new AppError("Slot not found or missing remaining capacity", 404)
    );
  }

  if (slot.remainingCapacity <= 0) {
    return next(new AppError("Slot is already fully booked", 409));
  }

  const overlappingAppointments = await SlotModel.find({
    start: slot.start,
    end: slot.end,
    calendarId: "booked",
  });

  const totalWorkers = workers.length;
  let index = Number.isInteger(lastAssignedIndex) ? lastAssignedIndex : 0;

  let assignedWorker: User | undefined;
  for (let i = 0; i < totalWorkers; i++) {
    const candidate = workers[index % totalWorkers];
    const isBusy = overlappingAppointments.some(
      (appt) => String(appt.ownerId) === String(candidate._id)
    );
    if (!isBusy) {
      assignedWorker = candidate;
      break;
    }
    index++;
  }

  if (!assignedWorker) {
    return next(new AppError("No available workers for this time slot.", 409));
  }

  // Create a new Slot document for the appointment
  const newBookedSlot = await SlotModel.create({
    title: `Booked Appointment with ${assignedWorker.firstName }`,
    description: eventData.description || "",
    start: slot.start,
    end: slot.end,
    calendarId: "booked",
    ownerId: assignedWorker._id,
    clientId: eventData.clientId ?? user?._id ?? `guest-${Date.now()}`,
    clientName: eventData.clientName ?? user?.firstName ?? "Guest",
    visibility: slot.visibility,
  });

  // Decrement capacity of original slot
  slot.remainingCapacity -= 1;
  await slot.save();

  res.locals.updatedSlot = slot;
  res.locals.bookedSlot = newBookedSlot;
  res.locals.lastAssignedIndex = (index + 1) % totalWorkers;

  next();
};
