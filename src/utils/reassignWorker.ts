import { Request, Response, NextFunction } from 'express'
import { parseISO, addMinutes, format } from 'date-fns'
import { User } from '../app'
import { CalendarEventInput } from './generateSlots'

// Define plain appointment type (not Mongoose document)
type PlainAppointment = {
  title: string
  description: string
  start: string
  end: string
  calendarId?: string
  ownerId?: string
  clientId?: string
  clientName?: string
  sharedWith?: string[]
  visibility?: 'public' | 'internal'
}

// export async function reassignAppointmentsMiddleware(
//   req: Request,
//   res: Response,
//   next: NextFunction,
// ) {
//   try {
//     const { sickWorkerId } = req.body

//     if (!sickWorkerId) {
//       res.status(400).json({ message: 'sickWorkerId is required.' })
//       return
//     }

//     const [events, workers] = await Promise.all([
//       AppointmentModel.find(),
//       UserModel.find({ role: 'worker' }),
//     ])

//     const sickWorkers = [sickWorkerId]
//     const updatedEvents: PlainAppointment[] = []

//     const appointmentsToReassign = events.filter(
//       (e) =>
//         e.ownerId === sickWorkerId && e.title?.startsWith('Booked Appointment'),
//     )

//     for (const appointment of appointmentsToReassign) {
//       const start = parseISO(appointment.start)
//       const end = parseISO(appointment.end)

//       const availableWorker = workers.find(
//         (w) =>
//           w.id !== sickWorkerId &&
//           !events.some(
//             (e) =>
//               e.ownerId === w.id &&
//               parseISO(e.start) < end &&
//               parseISO(e.end) > start,
//           ),
//       )

//       const doc = appointment.toObject()

//       if (availableWorker) {
//         const reassigned: PlainAppointment = {
//           title: `Booked Appointment with ${availableWorker.firstName}`,
//           description: doc.description,
//           start: doc.start,
//           end: doc.end,
//           calendarId: doc.calendarId,
//           ownerId: availableWorker.id.toString(),
//           clientId: doc.clientId?.toString(),
//           clientName: doc.clientName,
//           sharedWith: doc.sharedWith?.map((id) => id.toString()),
//           visibility: doc.visibility,
//         }
//         updatedEvents.push(reassigned)
//       } else {
//         for (const altWorker of workers.filter((w) => w.id !== sickWorkerId)) {
//           const candidateSlots = events.filter(
//             (e) =>
//               e.title === 'Available Slot' &&
//               !sickWorkers.includes(altWorker.id),
//           )

//           for (const slot of candidateSlots) {
//             const slotStart = parseISO(slot.start)
//             const durationMinutes = (end.getTime() - start.getTime()) / 60000
//             const slotEnd = addMinutes(slotStart, durationMinutes)

//             const conflict = events.some(
//               (e) =>
//                 e.ownerId === altWorker.id &&
//                 parseISO(e.start) < slotEnd &&
//                 parseISO(e.end) > slotStart,
//             )

//             if (!conflict) {
//               // Remove original appointment
//               events.splice(
//                 events.findIndex((e) => e.id === appointment.id),
//                 1,
//               )

//               // Remove conflicting slots
//               const slotsToRemove = events.filter(
//                 (e) =>
//                   e.title === 'Available Slot' &&
//                   parseISO(e.start) >= slotStart &&
//                   parseISO(e.end) <= slotEnd,
//               )
//               const cleanedEvents = events.filter(
//                 (e) => !slotsToRemove.includes(e),
//               )

//               const newAppointment: PlainAppointment = {
//                 title: `Booked Appointment with ${altWorker.firstName}`,
//                 description: doc.description,
//                 start: format(slotStart, 'yyyy-MM-dd HH:mm'),
//                 end: format(slotEnd, 'yyyy-MM-dd HH:mm'),
//                 calendarId: doc.calendarId,
//                 ownerId: altWorker.id.toString(),
//                 clientId: doc.clientId?.toString(),
//                 clientName: doc.clientName,
//                 sharedWith: doc.sharedWith?.map((id) => id.toString()),
//                 visibility: doc.visibility,
//               }

//               updatedEvents.push(newAppointment)
//               events.splice(0, events.length, ...cleanedEvents)
//               break
//             }
//           }
//         }
//       }
//     }

//     // Delete all original booked appointments for sick worker
//     await AppointmentModel.deleteMany({
//       ownerId: sickWorkerId,
//       title: /Booked Appointment/,
//     })

//     // Insert reassigned appointments
//     if (updatedEvents.length > 0) {
//       await AppointmentModel.insertMany(updatedEvents)
//     }

//     req.body.updatedEvents = updatedEvents
//     next()
//   } catch (err) {
//     console.error('Reassignment error:', err)
//     res.status(500).json({
//       status: 'fail',
//       message: err instanceof Error ? err.message : 'Internal server error',
//     })
//   }
// }
export const reassignAppointmentsMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const {
    sickWorkerId,
    events: originalEvents,
    workers,
    sickWorkers,
  }: {
    sickWorkerId: string
    events: CalendarEventInput[]
    workers: User[]
    sickWorkers: string[]
  } = req.body

  let events = [...originalEvents]

  const appointmentsToReassign = events.filter(
    (e) => e.ownerId === sickWorkerId && e.title?.startsWith('Booked Appointment'),
  )

  for (const appointment of appointmentsToReassign) {
    const start = parseISO(appointment.start)
    const end = parseISO(appointment.end)

    const availableWorker = workers.find(
      (w) =>
        w._id !== sickWorkerId &&
        !events.some(
          (e) => e.ownerId === w._id && parseISO(e.start) < end && parseISO(e.end) > start,
        ),
    )

    if (availableWorker) {
      appointment.ownerId = availableWorker._id
      appointment.title = `Booked Appointment with ${availableWorker.name}`
    } else {
      let reassigned = false
      for (const altWorker of workers.filter((w) => w._id !== sickWorkerId)) {
        const candidateSlots = events.filter(
          (e) => e.title === 'Available Slot' && !sickWorkers.includes(altWorker._id),
        )

        for (const slot of candidateSlots) {
          const slotStart = parseISO(slot.start)
          const durationMinutes = (end.getTime() - start.getTime()) / 60000
          const slotEnd = addMinutes(slotStart, durationMinutes)

          const conflict = events.some(
            (e) =>
              e.ownerId === altWorker._id &&
              parseISO(e.start) < slotEnd &&
              parseISO(e.end) > slotStart,
          )

          if (!conflict) {
            const index = events.findIndex((ev) => ev._id === appointment._id)
            if (index !== -1) events.splice(index, 1)

            const slotsToRemove = events.filter(
              (e) =>
                e.title === 'Available Slot' &&
                parseISO(e.start) >= slotStart &&
                parseISO(e.end) <= slotEnd,
            )
            events = events.filter((e) => !slotsToRemove.includes(e))

            events.push({
              ...appointment,
              start: format(slotStart, 'yyyy-MM-dd HH:mm'),
              end: format(slotEnd, 'yyyy-MM-dd HH:mm'),
              ownerId: altWorker._id,
              title: `Booked Appointment with ${altWorker.name}`,
            })

            reassigned = true
            break
          }
        }

        if (reassigned) break
      }
    }
  }

  res.locals.updatedEvents = events.filter(
    (e) => !(e.ownerId === sickWorkerId && e.title?.startsWith('Booked Appointment')),
  )

  next()
}