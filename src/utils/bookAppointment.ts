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
    sickWorkerId,
    events: originalEvents,
    workers,
    sickWorkers,
  }: {
    sickWorkerId: string;
    events?: CalendarEventInput[];
    workers: User[];
    sickWorkers: string[];
  } = req.body;

  if (!Array.isArray(originalEvents)) {
    return next(
      new AppError("Missing or invalid 'events' array in request body", 400)
    );
  }

  let events = [...originalEvents];

  const appointmentsToReassign = events.filter(
    (e) =>
      e.ownerId === sickWorkerId && e.title?.startsWith("Booked Appointment")
  );

  for (const appointment of appointmentsToReassign) {
    const start = parseISO(appointment.start);
    const end = parseISO(appointment.end);

    const availableWorker = workers.find(
      (w) =>
        w._id !== sickWorkerId &&
        !events.some(
          (e) =>
            e.ownerId === w._id &&
            parseISO(e.start) < end &&
            parseISO(e.end) > start
        )
    );

    if (availableWorker) {
      appointment.ownerId = availableWorker._id;
      appointment.title = `Booked Appointment with ${availableWorker.name}`;
    } else {
      let reassigned = false;
      for (const altWorker of workers.filter((w) => w._id !== sickWorkerId)) {
        const candidateSlots = events.filter(
          (e) =>
            e.title === "Available Slot" && !sickWorkers.includes(altWorker._id)
        );

        for (const slot of candidateSlots) {
          const slotStart = parseISO(slot.start);
          const durationMinutes = (end.getTime() - start.getTime()) / 60000;
          const slotEnd = addMinutes(slotStart, durationMinutes);

          const conflict = events.some(
            (e) =>
              e.ownerId === altWorker._id &&
              parseISO(e.start) < slotEnd &&
              parseISO(e.end) > slotStart
          );

          if (!conflict) {
            const index = events.findIndex((ev) => ev._id === appointment._id);
            if (index !== -1) events.splice(index, 1);

            const slotsToRemove = events.filter(
              (e) =>
                e.title === "Available Slot" &&
                parseISO(e.start) >= slotStart &&
                parseISO(e.end) <= slotEnd
            );
            events = events.filter((e) => !slotsToRemove.includes(e));

            const newAppointment = {
              ...appointment,
              start: format(slotStart, "yyyy-MM-dd HH:mm"),
              end: format(slotEnd, "yyyy-MM-dd HH:mm"),
              ownerId: altWorker._id,
              title: `Booked Appointment with ${altWorker.name}`,
            };

            events.push(newAppointment);
            res.locals.updatedAppointment = newAppointment;
            reassigned = true;
            break;
          }
        }

        if (reassigned) break;
      }
    }
  }

  res.locals.updatedEvents = events.filter(
    (e) =>
      !(e.ownerId === sickWorkerId && e.title?.startsWith("Booked Appointment"))
  );

  next();
};
