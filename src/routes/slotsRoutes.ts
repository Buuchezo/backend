import { generateSlotsMiddleware } from "../../utils/generateSlots";
import express from "express";
import { createSlots, getSlot, getSlots } from "../controllers/slotsController";

const router = express.Router();

router.post("/", generateSlotsMiddleware, createSlots);
router.get("/", getSlots);
router.get("/:id", getSlot);

export default router;
