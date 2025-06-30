import { generateSlotsMiddleware } from "../utils/generateSlots";

import express from "express";
import {
  createSlots,
  getSlot,
  getSlots,
  updateAppointment,
  createAppointment,
  deleteAppointment,
  markWorkerSick,
} from "../controllers/slotsController";
import {
  protect,
  authorizeAppointmentAccess,
} from "../controllers/authenticationController";
const router = express.Router();

router.post("/reassign", markWorkerSick);
router.post("/:id", protect, createAppointment);
router.delete("/:id", protect, authorizeAppointmentAccess, deleteAppointment);
router.patch("/:id", protect, authorizeAppointmentAccess, updateAppointment);
router.post("/", generateSlotsMiddleware, createSlots);
router.get("/", getSlots);
router.get("/:id", protect, getSlot);

export default router;
