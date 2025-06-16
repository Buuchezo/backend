import {
  signup,
  login,
  forgotPassword,
  resetPassword,
} from '../controllers/authenticationController'
import {
  getAllUsers,
  createUser,
  getUser,
  updateUser,
  deleteUser,
  updateMe,
  deleteMe,
} from '../controllers/userController'
import express from 'express'
import {
  protect,
  updatePassword,
} from '../controllers/authenticationController'
const router = express.Router()
router.param('id', (req, res, next, val) => {

  next()
})

router.post('/signup', signup)
router.post('/login', login)

router.post('/forgotPassword', forgotPassword)
router.patch('/resetPassword/:token', resetPassword)
router.patch('/updateMyPassword', protect, updatePassword)
router.patch('/updateMe', protect, updateMe)
router.delete('/deleteMe', protect, deleteMe)

router.get('/', getAllUsers)
router.post('/', createUser)
router.get('/:id', getUser)
router.patch('/:id', updateUser)
router.delete('/:id', deleteUser)

export default router
