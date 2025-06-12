import { Request, Response, NextFunction } from "express";
import { parseISO, format, addMinutes } from "date-fns";
import { AppointmentModel } from "../models/appointmentModel";
import { UserModel } from "../models/userModel";
import { CalendarEventInput } from "./generateSlots";
import { User } from "../app";
import { AppError } from "./appErrorr";

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

  const formattedStart = format(parseISO(eventData.start), "yyyy-MM-dd HH:mm");
  const formattedEnd = format(parseISO(eventData.end), "yyyy-MM-dd HH:mm");

  const parsedStart = parseISO(formattedStart);
  const parsedEnd = parseISO(formattedEnd);

  const overlappingAppointments = events.filter((e) => {
    if (!e.title?.startsWith("Booked Appointment")) return false;

    try {
      const existingStart = parseISO(e.start);
      const existingEnd = parseISO(e.end);
      if (isNaN(existingStart.getTime()) || isNaN(existingEnd.getTime()))
        return false;

      return parsedStart < existingEnd && parsedEnd > existingStart;
    } catch {
      return false;
    }
  });

  // Rotate to next worker starting from lastAssignedIndex
  let assignedWorker: User | undefined = undefined;
  console.log(assignedWorker);
  const totalWorkers = workers.length;
  console.log(totalWorkers);
  let index = lastAssignedIndex;
  for (let i = 0; i < totalWorkers; i++) {
    const candidate = workers[index % totalWorkers];
    const isBusy = overlappingAppointments.some(
      (appt) => appt.ownerId === candidate._id
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

  const totalBooked = overlappingAppointments.length + 1;
  const isFullyBooked = totalBooked >= workers.length;

  const updatedEvents = [...events];
  if (isFullyBooked) {
    const slotIndex = updatedEvents.findIndex(
      (e) =>
        e.title === "Available Slot" &&
        format(parseISO(e.start), "yyyy-MM-dd HH:mm") === formattedStart &&
        format(parseISO(e.end), "yyyy-MM-dd HH:mm") === formattedEnd
    );
    if (slotIndex !== -1) {
      updatedEvents.splice(slotIndex, 1);
    }
  }

  const newAppointment: CalendarEventInput = {
    _id: Date.now().toString(),
    title: `Booked Appointment with ${assignedWorker.name}`,
    description: eventData.description || "",
    start: formattedStart,
    end: formattedEnd,
    calendarId: "booked",
    ownerId: assignedWorker._id,
    clientId: eventData.clientId ?? user?._id ?? `guest-${Date.now()}`,
    clientName: eventData.clientName ?? user?.name ?? "Guest",
  };

  updatedEvents.push(newAppointment);

  res.locals.updatedEvents = updatedEvents;
  res.locals.updatedAppointment = newAppointment;
  res.locals.lastAssignedIndex = (index + 1) % totalWorkers;

  next();
};
