import {
  addMinutes,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  startOfMonth,
} from "date-fns";
import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { UserModel } from "../models/userModel";

export interface CalendarEventInput {
  _id?: string | Types.ObjectId;
  title?: string;
  description?: string;
  start: string;
  end: string;
  calendarId?: string;
  ownerId?: string;
  clientId?: string;
  clientName?: string;
}

export async function generateSlotsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { year, month } = req.body;

  if (typeof year !== "number" || typeof month !== "number") {
    res
      .status(400)
      .json({ message: "Year and month must be provided as numbers." });
    return;
  }

  // ✅ Fetch all workers
  const workers = await UserModel.find({ role: "worker" });
  const workerCount = workers.length;
  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(new Date(year, month)),
    end: endOfMonth(new Date(year, month)),
  });

  const slots = [];

  for (const date of daysInMonth) {
    const dayOfWeek = getDay(date);

    let startHour: number | null = null;
    let endHour: number | null = null;

    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      startHour = 8;
      endHour = 16;
    } else if (dayOfWeek === 6) {
      startHour = 9;
      endHour = 13;
    } else {
      continue; // Skip Sundays
    }

    let current = new Date(date);
    current.setHours(startHour, 0, 0, 0);
    const end = new Date(date);
    end.setHours(endHour, 0, 0, 0);

    while (current < end) {
      const slotEnd = addMinutes(current, 60);

      slots.push({
        title: "Available Slot",
        description: "",
        start: format(current, "yyyy-MM-dd HH:mm"),
        end: format(slotEnd, "yyyy-MM-dd HH:mm"),
        calendarId: "available",
        remainingCapacity: workerCount, // ✅ Explicitly set
        ownerId: undefined, // ✅ Ensure included, even if null
        clientId: undefined,
        clientName: undefined,
        sharedWith: [],
        visibility: "public",
      });

      current = slotEnd;
    }
  }

  req.body.slots = slots;
  next();
}
