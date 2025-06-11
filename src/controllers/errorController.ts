import { AppError } from '../utils/appErrorr'
import { Response, Request, NextFunction } from 'express'

interface MongooseCastError extends Error {
  name: 'CastError'
  path: string
  value: string
}
interface MongooseValidationError extends Error {
  name: 'ValidationError'
  errors: Record<
    string,
    {
      message: string
      kind: string
      path: string
      value: unknown
    }
  >
}
interface JsonWebTokenError extends Error {
  name: 'JsonWebTokenError'
  message: string
}

interface MongoDuplicateKeyError {
  code: number
  keyValue: Record<string, string>
}
interface TokenExpiredError extends Error {
  name: 'TokenExpiredError'
  expiredAt: Date
}
function isTokenExpiredError(err: unknown): err is TokenExpiredError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    'expiredAt' in err &&
    (err as Record<string, unknown>).name === 'TokenExpiredError' &&
    (err as Record<string, unknown>).expiredAt instanceof Date
  )
}

function isMongoDuplicateKeyError(err: unknown): err is MongoDuplicateKeyError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as Record<string, unknown>).code === 'number' &&
    (err as Record<string, unknown>).code === 11000 &&
    'keyValue' in err
  )
}
function isMongooseValidationError(err: unknown): err is MongooseValidationError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as Record<string, unknown>).name === 'ValidationError' &&
    'errors' in err &&
    typeof (err as Record<string, unknown>).errors === 'object'
  )
}
function isJsonWebTokenError(err: unknown): err is JsonWebTokenError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    'message' in err &&
    (err as Record<string, unknown>).name === 'JsonWebTokenError' &&
    typeof (err as Record<string, unknown>).message === 'string'
  )
}
function isMongooseCastError(err: unknown): err is MongooseCastError {
  if (typeof err === 'object' && err !== null && 'name' in err && 'path' in err && 'value' in err) {
    const e = err as { name: unknown; path: unknown; value: unknown }
    return e.name === 'CastError' && typeof e.path === 'string' && typeof e.value === 'string'
  }
  return false
}

const handleCastErrorDB = (err: MongooseCastError): AppError => {
  const message = `Invalid ${err.path}: ${err.value}`
  return new AppError(message, 400)
}
const handleDuplicateFieldsDB = (err: MongoDuplicateKeyError): AppError => {
  const key = Object.keys(err.keyValue)[0]
  const value = err.keyValue[key]
  const message = `Duplicate field value: "${value}". Please use another ${key}.`
  return new AppError(message, 400)
}
const handleJsonWebTokenError = ({ message }: JsonWebTokenError): AppError => {
  return new AppError(`Invalid token. ${message}`, 401)
}
const handleTokenExpiredError = ({ message }: TokenExpiredError): AppError => {
  return new AppError(`Your token has expired. ${message}`, 401)
}

const handleValidatorError = (err: MongooseValidationError): AppError => {
  const errors = Object.values(err.errors)
    .map((e) => e.message)
    .join('. ')
  return new AppError(`Validation failed. ${errors}`, 400)
}

const sendErrorDev = (err: AppError, res: Response): void => {
  res.status(err.statusCode || 500).json({
    status: err.status || 'error',
    message: err.message,
    stack: err.stack,
    error: err,
  })
}

const sendErrorProd = (err: AppError, res: Response): void => {
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    })
  } else {
    // For unexpected errors, don't expose details
    console.error('💥 Unexpected error:', err)
    res.status(500).json({
      status: 'error',
      message: 'Something went very wrong!',
    })
  }
}

// Main global error handler
export function errorController(
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction,
): void {
  err.statusCode = err.statusCode || 500
  err.status = err.status || 'error'

  const env = process.env.NODE_ENV

  if (env === 'development') {
    sendErrorDev(err, res)
  } else if (env === 'production') {
    let error: AppError = Object.assign(Object.create(err), err)

    // Handle specific error types
    if (isMongooseCastError(err)) {
      error = handleCastErrorDB(err)
    }
    if (isMongoDuplicateKeyError(err)) {
      error = handleDuplicateFieldsDB(err)
    }
    if (isJsonWebTokenError(err)) {
      error = handleJsonWebTokenError(err)
    }
    if (isMongooseValidationError(err)) {
      error = handleValidatorError(err)
    }
    if (isTokenExpiredError(err)) {
      error = handleTokenExpiredError(err)
    }
    sendErrorProd(error, res)
  } else {
    // Fallback for unknown/missing NODE_ENV
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    })
  }
}
