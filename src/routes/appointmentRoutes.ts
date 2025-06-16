import express, { Request, Response, NextFunction } from 'express'

import {
  getAllAppointments,
  reassignAppointmentsController,
  getAppointment,
  createAppointment,
  updateAppointment,
  deleteAppointment,
} from '../controllers/appointmentsController'

import { addEventMiddleware } from '../utils/bookAppointment'
import { reassignAppointmentsMiddleware } from '../utils/reassignWorker'
import { protect, restrictTo } from '../controllers/authenticationController'

const router = express.Router()

export async function conditionalAppointmentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const calendarId = req.body?.eventData?.calendarId

  if (!calendarId) {
    res.status(400).json({ message: 'Missing calendarId in eventData.' })
    return
  }

  if (calendarId === 'available') {
    await addEventMiddleware(req, res, next)
    return
  }

 

  res.status(400).json({ message: `Unsupported calendarId: ${calendarId}` })
}

router.get('/', getAllAppointments)
router.get('/:id', getAppointment)
router.post('/', createAppointment)
router.patch('/:id', conditionalAppointmentHandler, updateAppointment)
router.patch('/reassign/:id', reassignAppointmentsMiddleware, reassignAppointmentsController)
router.delete('/:id',protect, restrictTo('admin','worker'), deleteAppointment)

export default router
