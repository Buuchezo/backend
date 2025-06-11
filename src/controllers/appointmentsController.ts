import { NextFunction, Request, Response } from 'express'
import { AppointmentModel } from '../models/appointmentModel'
import { catchAsync } from '../utils/catchAsync'
import { AppError } from '../utils/appErrorr'

type SanitizedQuery = Record<string, string | string[] | undefined>

export const getAllAppointments = catchAsync(
  async (req: Request & { sanitizedQuery?: SanitizedQuery }, res: Response) => {
    const query = req.sanitizedQuery ?? req.query
    const appointments = await AppointmentModel.find(query)
    res.status(200).json({
      status: 'success',
      results: appointments.length,
      data: {
        appointments,
      },
    })
  },
)
export const getAppointment = catchAsync(
  async (
    req: Request & { sanitizedQuery?: SanitizedQuery },
    res: Response,
    next: NextFunction,
  ) => {
    const appointment = await AppointmentModel.findById(req.params.id)
    if (!appointment) {
      return next(new AppError('No appointment found with that id', 404))
    }
    res.status(200).json({
      status: 'success',
      data: {
        appointment,
      },
    })
  },
)

export const createAppointment = catchAsync(
  async (req: Request, res: Response) => {
    const slots = req.body.slots

    if (!Array.isArray(slots) || slots.length === 0) {
      res.status(400).json({ message: 'No appointment slots to create.' })
      return
    }

    const insertedSlots = await AppointmentModel.insertMany(slots)

    res.status(201).json({
      status: 'success',
      message: `${insertedSlots.length} slots created.`,
      data: insertedSlots,
    })
  },
)
export const updateAppointment = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const appointment = await AppointmentModel.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      },
    )

    if (!appointment) {
      return next(new AppError('No appointment found with that id', 404))
    }

    res.status(200).json({
      status: 'success',
      data: { appointment },
    })
  },
)

export const deleteAppointment = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const appointment = await AppointmentModel.findByIdAndDelete(req.params.id)
    if (!appointment) {
      return next(new AppError('No appointment found with that id', 404))
    }
    res.status(204).json({
      status: 'success',
    })
  },
)

export const reassignAppointmentsController = catchAsync(
  async (req: Request, res: Response) => {
    const updated = req.body.updatedEvents

    if (!updated || updated.length === 0) {
      res.status(200).json({
        status: 'success',
        message: 'No appointments were reassigned.',
        data: [],
      })
      return
    }

    res.status(200).json({
      status: 'success',
      message: `${updated.length} appointments reassigned.`,
      data: updated,
    })
  },
)
