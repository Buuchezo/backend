import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import xss from "xss";
import cors from "cors";

import morgan from "morgan";
import slotsRouter from "./routes/slotsRoutes";
import userRouter from "./routes/userRoutes";
import appointmentRouter from "./routes/appointmentRoutes";
import internalEventsRouter from "./routes/internalEventsRoutes";
import { AppError } from "./utils/appErrorr";
import { errorController } from "./controllers/errorController";
import helmet from "helmet";
import { Types } from "mongoose";

function sanitize(obj: Record<string, unknown>): void {
  for (const key in obj) {
    if (key.startsWith("$") || key.includes(".")) {
      delete obj[key];
    } else {
      const value = obj[key];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        sanitize(value as Record<string, unknown>);
      }
    }
  }
}

export const mongoSanitize =
  () => (req: Request, res: Response, next: NextFunction) => {
    if (req.body && typeof req.body === "object") {
      sanitize(req.body);
    }

    if (req.query && typeof req.query === "object") {
      const sanitizedQuery = { ...req.query };
      sanitize(sanitizedQuery);
      // Reassign the sanitized copy
      Object.defineProperty(req, "query", {
        value: sanitizedQuery,
        writable: false,
        configurable: true,
        enumerable: true,
      });
    }

    next();
  };

function sanitizeObject<T>(input: T): T {
  if (typeof input === "string") {
    return xss(input) as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeObject(item)) as T;
  }

  if (input !== null && typeof input === "object") {
    const result = {} as { [K in keyof T]: T[K] };
    for (const key in input) {
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        const value = input[key];
        result[key] = sanitizeObject(value);
      }
    }
    return result;
  }

  return input;
}

export const xssSanitizer = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  req.body = sanitizeObject(req.body);
  req.params = sanitizeObject(req.params);
  // Avoid req.query if it throws errors due to read-only issues
  next();
};

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
// prevent parameter pollution
export const hppSanitizer = (whitelist: string[] = []) => {
  return (
    req: Request & { sanitizedQuery?: typeof req.query },
    _res: Response,
    next: NextFunction
  ): void => {
    const sanitizedQuery: Record<string, string | string[] | undefined> = {};

    for (const key in req.query) {
      const value = req.query[key];

      if (Array.isArray(value) && isStringArray(value)) {
        sanitizedQuery[key] = whitelist.includes(key) ? value : value[0];
      } else if (isString(value)) {
        sanitizedQuery[key] = value;
      }
    }

    req.sanitizedQuery = sanitizedQuery;
    next();
  };
};
export interface CalendarEventInput {
  id?: string; // frontend-friendly ID
  _id?: Types.ObjectId; // MongoDB ID (for backend use)
  title: string;
  description: string;
  start: string;
  end: string;
  calendarId?: "booked" | "available" ;
  ownerId?: Types.ObjectId | string;
  clientId?: Types.ObjectId | string;
  clientName?: string;
  sharedWith?: (Types.ObjectId | string)[];
  visibility?: "public" | "internal";
  remainingCapacity?: number;
}

export interface User {
  _id: string;
  firstName: string;
  lastName: string;
  role: "user" | "worker" | "admin";
}

const app = express();
app.set("trust proxy", 1);

app.use(cors());

//set security http headers
app.use(helmet());
//1. GLOBAL MIDDLEWARES

//Development logging
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}
//limits the number of request from the same IP
const limiter = rateLimit({
  max: 100,
  windowMs: 60 * 60 * 1000,
  message: "Too many requests from this IP, please try again in an hour!",
});

app.use("/api", limiter);

//Body parser
app.use(express.json({ limit: "1mb" }));

//Data sanitisation against NoSql query injection

app.use(mongoSanitize());
//Data sanitisation against XSS
app.use(xssSanitizer);
app.use(hppSanitizer(["tags", "category"]));

app.use(express.static(`${__dirname}/index.html`));

app.use((req: Request, res: Response, next: NextFunction) => {
  (req as Request & { requestTime?: string }).requestTime =
    new Date().toISOString();

  next();
});

app.use("/api/v1/users", userRouter);
app.use("/api/v1/appointments", appointmentRouter);
app.use("/api/v1/internal-events", internalEventsRouter);
app.use("/api/v1/slots", slotsRouter);

app.all(/(.*)/, (req: Request, res: Response, next: NextFunction) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server`, 404));
});

app.use(errorController);

export default app;
