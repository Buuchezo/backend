import { Request, Response, NextFunction } from 'express'
import { InternalEventModel } from '../models/internalEventModel'
import { catchAsync } from '../utils/catchAsync'
import { AppError } from '../utils/appErrorr'

export const getAllInternalEvents = catchAsync(
  async (req: Request, res: Response) => {
    const allInternalEvents = await InternalEventModel.find()
    res.status(200).json({
      status: 'success',
      results: allInternalEvents.length,
      data: {
        allInternalEvents,
      },
    })
  },
)
export const getInternalEvent = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = await InternalEventModel.findById(req.params.id).populate({
      path: 'sharedWith',
      select: '-__v -passwordChangedAt',
    })
    if (!user) {
      return next(new AppError('No Internal event found with that id', 404))
    }
    res.status(200).json({
      status: 'success',
      data: { user },
    })
  },
)

export const updateInternalEvent = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const internalEvent = await InternalEventModel.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      },
    )
    if (!internalEvent) {
      return next(new AppError('No internal event found with that id', 404))
    }
    res.status(200).json({
      status: 'success',
      data: { internalEvent },
    })
  },
)

export const deleteInternalEvent = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const internalEvent = await InternalEventModel.findByIdAndDelete(
      req.params.id,
    )
    if (!internalEvent) {
      return next(new AppError('No internal event found with that id', 404))
    }
    res.status(204).json({
      status: 'success',
    })
  },
)

// POST a new internal event
export const createInternalEvent = catchAsync(
  async (req: Request, res: Response) => {
    const newInternalEvent = await InternalEventModel.create(req.body)

    res.status(201).json({
      status: 'success',
      data: {
        internalEvent: newInternalEvent,
      },
    })
  },
)
