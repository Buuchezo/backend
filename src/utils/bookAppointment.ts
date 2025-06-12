import { Request, Response, NextFunction } from "express";
import { parseISO, format } from "date-fns";
import { AppointmentModel } from "../models/appointmentModel";
import { UserModel } from "../models/userModel";
import { CalendarEventInput } from "./generateSlots";
import { User } from "../app";

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
    events: CalendarEventInput[];
    user: User | null;
    workers: User[];
    lastAssignedIndex: number;
  } = req.body;

  const formattedStart = normalizeToScheduleXFormat(eventData.start);
  const formattedEnd = normalizeToScheduleXFormat(eventData.end);

  const parsedStart = parseISO(formattedStart);
  const parsedEnd = parseISO(formattedEnd);

  // Find overlapping booked appointments
  const overlappingAppointments = events.filter((e) => {
    if (!e.title?.startsWith("Booked Appointment")) return false;

    const existingStart = parseISO(e.start);
    const existingEnd = parseISO(e.end);

    return parsedStart < existingEnd && parsedEnd > existingStart;
  });

  // Find a free worker for this time slot
  const freeWorker = workers.find(
    (worker) =>
      !overlappingAppointments.some((appt) => appt.ownerId === worker._id)
  );

  if (!freeWorker) {
    res
      .status(409)
      .json({ message: "No available workers for this time slot." });
    return;
  }

  // Count total booked for this slot
  const totalBooked = overlappingAppointments.length + 1;

  // Determine if all workers are booked
  const isFullyBooked = totalBooked >= workers.length;

  // Only remove the slot if all workers are booked
  const updatedEvents = [...events];
  if (isFullyBooked) {
    const slotIndex = updatedEvents.findIndex(
      (e) =>
        e.title === "Available Slot" &&
        normalizeToScheduleXFormat(e.start) === formattedStart &&
        normalizeToScheduleXFormat(e.end) === formattedEnd
    );
    if (slotIndex !== -1) {
      updatedEvents.splice(slotIndex, 1);
    }
  }

  // Add the booked appointment
  updatedEvents.push({
    _id: Date.now().toString(),
    title: `Booked Appointment with ${freeWorker.name}`,
    description: eventData.description || "",
    start: formattedStart,
    end: formattedEnd,
    calendarId: "booked",
    ownerId: freeWorker._id,
    clientId: eventData.clientId ?? user?._id ?? `guest-${Date.now()}`,
    clientName: eventData.clientName ?? user?.name ?? "Guest",
  });

  // Attach result to response locals or request object if needed in next middleware
  res.locals.updatedEvents = updatedEvents;
  res.locals.lastAssignedIndex = lastAssignedIndex; // unchanged

  next();
};
