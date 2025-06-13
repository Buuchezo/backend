import { format, parseISO } from 'date-fns'
import mongoose from 'mongoose'
// import { CalendarEventInput, User, Worker } from '../' // adjust path
// import { normalizeToScheduleXFormat } from './dateUtils' // adjust path
import { CalendarEventInput, User } from '../app'

function normalizeToScheduleXFormat(datetime: string): string {
  try {
    return format(parseISO(datetime), "yyyy-MM-dd HH:mm");
  } catch {
    return datetime;
  }
}

export function addEventHelper({
  eventData,
  events,
  user,
  workers,
  lastAssignedIndex,
}: {
  eventData: CalendarEventInput
  events: CalendarEventInput[]
  user: User | null
  workers: User[] // workers are just Users with role 'worker'
  lastAssignedIndex: number
}): {
  updatedEvents: CalendarEventInput[]
  lastAssignedIndex: number
  newEvent: CalendarEventInput
} | null {
  const formattedStart = normalizeToScheduleXFormat(eventData.start)
  const formattedEnd = normalizeToScheduleXFormat(eventData.end)

  const parsedStart = parseISO(formattedStart)
  const parsedEnd = parseISO(formattedEnd)

  // Ensure all events have properly formatted dates
  const normalizedEvents = events.map((e) => ({
    ...e,
    start: typeof e.start === 'string' ? e.start : new Date(e.start).toISOString(),
    end: typeof e.end === 'string' ? e.end : new Date(e.end).toISOString(),
  }))

  // Find overlapping booked appointments
  const overlappingAppointments = normalizedEvents.filter((e) => {
    if (!e.title?.startsWith('Booked Appointment')) return false
    const existingStart = parseISO(e.start)
    const existingEnd = parseISO(e.end)
    return parsedStart < existingEnd && parsedEnd > existingStart
  })

  // Find a free worker for this time slot
  const freeWorker = workers.find(
    (worker) =>
      !overlappingAppointments.some(
        (appt) => appt.ownerId?.toString() === worker._id.toString()
      )
  )

  if (!freeWorker) {
    return null // All workers are already booked for this time slot
  }

  // Count total booked appointments for this slot
  const totalBooked = overlappingAppointments.length + 1
  const isFullyBooked = totalBooked >= workers.length

  const updatedEvents = [...normalizedEvents]

  // Remove "Available Slot" if the slot is now fully booked
  if (isFullyBooked) {
    const slotIndex = updatedEvents.findIndex(
      (e) =>
        e.title === 'Available Slot' &&
        normalizeToScheduleXFormat(e.start) === formattedStart &&
        normalizeToScheduleXFormat(e.end) === formattedEnd
    )
    if (slotIndex !== -1) {
      updatedEvents.splice(slotIndex, 1)
    }
  }

  // Create a new ObjectId
  const newObjectId = new mongoose.Types.ObjectId()

  // Determine the client ID
  const clientId =
    eventData.clientId && mongoose.Types.ObjectId.isValid(eventData.clientId)
      ? new mongoose.Types.ObjectId(eventData.clientId)
      : user && mongoose.Types.ObjectId.isValid(user._id)
      ? new mongoose.Types.ObjectId(user._id)
      : undefined

  // Create the new booked appointment event
  const newEvent: CalendarEventInput = {
    id: newObjectId.toString(), // for frontend
    _id: newObjectId, // for MongoDB
    title: `Booked Appointment with ${freeWorker.firstName} ${freeWorker.lastName}`,
    description: eventData.description || '',
    start: formattedStart,
    end: formattedEnd,
    calendarId: 'booked',
    ownerId: freeWorker._id,
    clientId,
    clientName: eventData.clientName ?? `${user?.firstName ?? 'Guest'} ${user?.lastName ?? ''}`.trim(),
  }

  updatedEvents.push(newEvent)

  return {
    updatedEvents,
    lastAssignedIndex,
    newEvent,
  }
}