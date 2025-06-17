import { Request, Response, NextFunction } from "express";
import { InternalEventModel } from "../models/internalEventModel";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/appErrorr";

export const getAllInternalEvents = catchAsync(
  async (req: Request, res: Response) => {
    const allInternalEvents = await InternalEventModel.find();
    res.status(200).json({
      status: "success",
      results: allInternalEvents.length,
      data: {
        allInternalEvents,
      },
    });
  }
);
export const getInternalEvent = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = await InternalEventModel.findById(req.params.id).populate({
      path: "sharedWith",
      select: "-__v -passwordChangedAt",
    });
    if (!user) {
      return next(new AppError("No Internal event found with that id", 404));
    }
    res.status(200).json({
      status: "success",
      data: { user },
    });
  }
);

export const updateInternalEvent = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const internalEvent = await InternalEventModel.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );
    if (!internalEvent) {
      return next(new AppError("No internal event found with that id", 404));
    }
    res.status(200).json({
      status: "success",
      data: { internalEvent },
    });
  }
);

export const deleteInternalEvent = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const internalEvent = await InternalEventModel.findByIdAndDelete(
      req.params.id
    );
    if (!internalEvent) {
      return next(new AppError("No internal event found with that id", 404));
    }
    res.status(204).json({
      status: "success",
    });
  }
);

// POST a new internal event
export const createInternalEvent = catchAsync(
  async (req: Request, res: Response) => {
    const { eventData } = req.body;

    if (!eventData) {
      res.status(400).json({ error: "Missing eventData in request body" });
      return;
    }

    const newInternalEvent = await InternalEventModel.create(eventData);

    res.status(201).json({
      status: "success",
      data: {
        internalEvent: newInternalEvent,
      },
    });
  }
);
