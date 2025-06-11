import { NextFunction, Request, Response } from 'express'
import { UserModel } from '../models/userModel'
import { catchAsync } from '../utils/catchAsync'
import { AppError } from '../utils/appErrorr'
import { AuthenticatedRequest } from './authenticationController'

const filterObj = <T extends object, K extends keyof T>(
  obj: T,
  ...allowedFields: K[]
): Partial<T> => {
  const newObj: Partial<T> = {}

  allowedFields.forEach((key) => {
    if (key in obj) {
      newObj[key] = obj[key]
    }
  })

  return newObj
}

export const getAllUsers = catchAsync(async (req: Request, res: Response) => {
  const users = await UserModel.find()
  res.status(200).json({
    status: 'success',
    results: users.length,
    data: { users },
  })
})

export const getUser = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = await UserModel.findById(req.params.id)
    if (!user) {
      return next(new AppError('No user found with that id', 404))
    }
    res.status(200).json({
      status: 'success',
      data: { user },
    })
  },
)

export const updateUser = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = await UserModel.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
    if (!user) {
      return next(new AppError('No user found with that id', 404))
    }
    res.status(200).json({
      status: 'success',
      data: { user },
    })
  },
)

export const deleteUser = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = await UserModel.findByIdAndDelete(req.params.id)
    if (!user) {
      return next(new AppError('No user found with that id', 404))
    }
    res.status(204).json({
      status: 'success',
    })
  },
)

export const createUser = catchAsync(async (req: Request, res: Response) => {
  const newUser = await UserModel.create(req.body)
  res.status(201).json({
    status: 'success',
    data: { user: newUser },
  })
})

export const updateMe = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // 1. Prevent password updates through this route
    if (req.body.password || req.body.passwordConfirm) {
      return next(new AppError('Changing password not allowed', 400))
    }

    // 2. Filter allowed fields
    const filteredBody = filterObj(req.body, 'firstName', 'lastName', 'email') // adjust fields as needed

    // 3. Update user
    const updatedUser = await UserModel.findByIdAndUpdate(
      req.user!.id, // non-null assertion because middleware ensures it exists
      filteredBody,
      {
        new: true,
        runValidators: true,
      },
    )

    res.status(200).json({
      status: 'success',
      data: {
        user: updatedUser,
      },
    })
  },
)

export const deleteMe = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    await UserModel.findByIdAndUpdate(req.user!.id, { active: false })

    res.status(204).json({
      status: 'success',
      data: null,
    })
  },
)
