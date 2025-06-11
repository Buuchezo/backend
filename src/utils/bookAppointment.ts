
import { Request, Response, NextFunction } from 'express'
import { parseISO, format } from 'date-fns'
import { AppointmentModel } from '../models/appointmentModel'
import { UserModel } from '../models/userModel'

function normalizeToScheduleXFormat(datetime: string): string {
  try {
    return format(parseISO(datetime), 'yyyy-MM-dd HH:mm')
  } catch {
    return datetime
  }
}

export async function bookAppointmentMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const { eventData } = req.body

    if (!eventData || !eventData.start || !eventData.end) {
      return res.status(400).json({ message: 'Missing required event data.' })
    }

    const formattedStart = normalizeToScheduleXFormat(eventData.start)
    const formattedEnd = normalizeToScheduleXFormat(eventData.end)

    const [events, workers] = await Promise.all([
      AppointmentModel.find(),
      UserModel.find({ role: 'worker' }),
    ])

    const user =
      eventData.clientId && typeof eventData.clientId === 'string'
        ? await UserModel.findById(eventData.clientId)
        : null

    const overlapping = events.filter(
      (e) =>
        e.title?.startsWith('Booked Appointment') &&
        parseISO(e.start) < parseISO(formattedEnd) &&
        parseISO(e.end) > parseISO(formattedStart),
    )

    const freeWorker = workers.find(
      (worker) => !overlapping.some((appt) => appt.ownerId === worker.id),
    )

    if (!freeWorker) {
      // No worker available — delete the slot so it's no longer bookable
      await AppointmentModel.findOneAndDelete({
        title: 'Available Slot',
        start: formattedStart,
        end: formattedEnd,
        calendarId: 'available',
      })

      return res.status(409).json({ message: 'No available workers for this time slot.' })
    }

    // Worker available — update the slot to booked
    const updated = await AppointmentModel.findOneAndUpdate(
      {
        title: 'Available Slot',
        start: formattedStart,
        end: formattedEnd,
        calendarId: 'available',
      },
      {
        $set: {
          title: `Booked Appointment with ${freeWorker.firstName}`,
          calendarId: 'booked',
          description: eventData.description || '',
          ownerId: freeWorker.id,
          clientId: eventData.clientId ?? `guest-${Date.now()}`,
          clientName: eventData.clientName ?? user?.firstName ?? 'Guest',
        },
      },
      { new: true },
    )

    if (!updated) {
      return res.status(404).json({ message: 'Matching available slot not found.' })
    }

    req.body.updatedAppointment = updated
    next()
  } catch (err) {
    console.error('Booking error:', err)
    res.status(500).json({
      message: err instanceof Error ? err.message : 'Internal server error',
    })
  }
}
