import express from "express";
import {
  getAllInternalEvents,
  createInternalEvent,
  getInternalEvent,
  deleteInternalEvent,
  updateInternalEvent,
} from "../controllers/internalEventsController";
import {
  protect,
  canDeleteInternalEvent,
  canUpdateInternalEvent,
} from "../controllers/authenticationController";

const router = express.Router();

router.get("/", protect, getAllInternalEvents);
router.get("/:id", protect, getInternalEvent);
router.delete("/:id", protect, canDeleteInternalEvent, deleteInternalEvent);
router.patch("/:id", protect, canUpdateInternalEvent, updateInternalEvent);
router.post("/", protect, createInternalEvent);

export default router;
