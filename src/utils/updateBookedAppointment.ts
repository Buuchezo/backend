import { Request, Response, NextFunction } from "express";
import { parseISO, format, addMinutes } from "date-fns";
import { AppointmentModel } from "../models/appointmentModel";
import { UserModel } from "../models/userModel";
import { User } from "../app";
import { CalendarEventInput } from "./generateSlots";

function normalizeToScheduleXFormat(datetime: string): string {
  try {
    return format(parseISO(datetime), "yyyy-MM-dd HH:mm");
  } catch {
    return datetime;
  }
}

// function generateAvailableSlotsBetween(start: Date, end: Date, idSeedStart: number) {
//   const slots = []
//   let idSeed = idSeedStart
//   let current = new Date(start)

//   while (addMinutes(current, 60) <= end) {
//     const slotEnd = addMinutes(current, 60)
//     if (slotEnd <= end) {
//       slots.push({
//         id: idSeed++,
//         title: 'Available Slot',
//         description: '',
//         start: format(current, 'yyyy-MM-dd HH:mm'),
//         end: format(slotEnd, 'yyyy-MM-dd HH:mm'),
//         calendarId: 'available',
//       })
//     }
//     current = slotEnd
//   }

//   return { slots, nextId: idSeed }
// }

// export async function updateEventMiddleware(req: Request, res: Response, next: NextFunction) {
//   try {
//     const { eventData } = req.body
//     if (!eventData || !eventData.id || !eventData.start || !eventData.end) {
//       res.status(400).json({ message: 'Missing event update data.' })
//       return
//     }

//     const formattedStart = normalizeToScheduleXFormat(eventData.start)
//     const formattedEnd = normalizeToScheduleXFormat(eventData.end)

//     const original = await AppointmentModel.findById(eventData.id)
//     if (!original) {
//       res.status(404).json({ message: 'Original appointment not found.' })
//       return
//     }

//     // Remove the old appointment
//     await AppointmentModel.findByIdAndDelete(eventData.id)

//     const originalStart = parseISO(original.start)
//     const originalEnd = parseISO(original.end)
//     const newStart = parseISO(formattedStart)
//     const newEnd = parseISO(formattedEnd)

//     // Remove any conflicting "Available Slot" entries
//     await AppointmentModel.deleteMany({
//       title: 'Available Slot',
//       $or: [
//         {
//           start: { $gte: formattedStart, $lt: formattedEnd },
//         },
//         {
//           end: { $gt: formattedStart, $lte: formattedEnd },
//         },
//       ],
//     })

//     // Get the worker name again
//     const assignedWorker = await UserModel.findById(original.ownerId)
//     const dynamicTitle = assignedWorker
//       ? `Booked Appointment with ${assignedWorker.firstName}`
//       : 'Booked Appointment'

//     // Save the updated appointment
//     const updated = await AppointmentModel.create({
//       id: original.id,
//       title: dynamicTitle,
//       description: eventData.description || original.description || '',
//       start: formattedStart,
//       end: formattedEnd,
//       calendarId: 'booked',
//       ownerId: original.ownerId,
//       clientId: original.clientId,
//       clientName: eventData.clientName ?? original.clientName ?? 'Guest',
//     })

//     // Generate and insert free slots from before/after rescheduled range
//     const idSeed = Date.now() + 1
//     const { slots: beforeSlots, nextId } = generateAvailableSlotsBetween(
//       originalStart,
//       newStart,
//       idSeed,
//     )
//     const { slots: afterSlots } = generateAvailableSlotsBetween(newEnd, originalEnd, nextId)

//     if (beforeSlots.length) await AppointmentModel.insertMany(beforeSlots)
//     if (afterSlots.length) await AppointmentModel.insertMany(afterSlots)

//     req.body.updatedAppointment = updated
//     next()
//   } catch (err) {
//     console.error('Update event error:', err)
//     res.status(500).json({ message: err instanceof Error ? err.message : 'Server error' })
//     return
//   }
// }

function generateAvailableSlotsBetween(
  start: Date,
  end: Date
): CalendarEventInput[] {
  const slots: CalendarEventInput[] = [];
  let current = new Date(start);

  while (addMinutes(current, 60) <= end) {
    const slotEnd = addMinutes(current, 60);
    if (slotEnd <= end) {
      slots.push({
        title: "Available Slot",
        description: "",
        start: format(current, "yyyy-MM-dd HH:mm"),
        end: format(slotEnd, "yyyy-MM-dd HH:mm"),
        calendarId: "available",
      });
    }
    current = slotEnd;
  }

  return slots;
}

export const updateEventMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const {
    eventData,
    events,
    workers,
  }: {
    eventData: CalendarEventInput;
    events: CalendarEventInput[];
    workers: User[];
  } = req.body;

  const formattedStart = normalizeToScheduleXFormat(eventData.start);
  const formattedEnd = normalizeToScheduleXFormat(eventData.end);

  const index = events.findIndex((e) => e._id === eventData._id);
  if (index === -1) {
    res.status(404).json({ message: "Original event not found" });
    return;
  }

  const original = events[index];
  events.splice(index, 1);

  const originalStart = parseISO(original.start);
  const originalEnd = parseISO(original.end);
  const newStart = parseISO(formattedStart);
  const newEnd = parseISO(formattedEnd);

  const conflictingSlots = events.filter(
    (e) =>
      e.title === "Available Slot" &&
      ((parseISO(e.start) >= newStart && parseISO(e.start) < newEnd) ||
        (parseISO(e.end) > newStart && parseISO(e.end) <= newEnd))
  );
  conflictingSlots.forEach((slot) => {
    const i = events.findIndex((ev) => ev._id === slot._id);
    if (i !== -1) events.splice(i, 1);
  });

  const assignedWorker = workers.find((w) => w._id === original.ownerId);
  const dynamicTitle = assignedWorker
    ? `Booked Appointment with ${assignedWorker.name}`
    : "Booked Appointment";

  const updatedEvents: CalendarEventInput[] = [
    ...events,
    {
      _id: eventData._id,
      title: dynamicTitle,
      description: eventData.description || "",
      start: formattedStart,
      end: formattedEnd,
      calendarId: "booked",
      ownerId: original.ownerId,
      clientId: original.clientId,
      clientName: eventData.clientName ?? original.clientName ?? "Guest",
    },
  ];

  const beforeSlots = generateAvailableSlotsBetween(originalStart, newStart);
  const afterSlots = generateAvailableSlotsBetween(newEnd, originalEnd);

  updatedEvents.push(...beforeSlots, ...afterSlots);

  res.locals.updatedEvents = updatedEvents;
  next();
};
