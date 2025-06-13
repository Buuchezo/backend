import { generateSlotsMiddleware } from "../utils/generateSlots";

import express from "express";
import {
  createSlots,
  getSlot,
  getSlots,
  updateSlot,
  createAppointment
} from "../controllers/slotsController";
import { addEventMiddleware } from "../utils/bookAppointment";
const router = express.Router();

router.post("/", generateSlotsMiddleware, createSlots);
router.post("/:id", createAppointment);
router.get("/", getSlots);
router.get("/:id", getSlot);
router.patch("/:id", addEventMiddleware, updateSlot);

export default router;
