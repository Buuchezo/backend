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
const router = express.Router();

router.post('/reassign', markWorkerSick)
router.post("/:id", createAppointment);
router.delete("/:id", deleteAppointment);
router.patch("/:id", updateAppointment);
router.post("/", generateSlotsMiddleware, createSlots);
router.get("/", getSlots);
router.get("/:id", getSlot);



export default router;
