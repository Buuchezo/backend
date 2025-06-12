import { generateSlotsMiddleware } from "../utils/generateSlots";
import express from "express";
import {
  createSlots,
  getSlot,
  getSlots,
  updateSlot,
} from "../controllers/slotsController";
import { addEventMiddleware } from "../utils/bookAppointment";
const router = express.Router();

router.post("/", generateSlotsMiddleware, createSlots);
router.get("/", getSlots);
router.get("/:id", getSlot);
router.put("/:id", addEventMiddleware, updateSlot);

export default router;
