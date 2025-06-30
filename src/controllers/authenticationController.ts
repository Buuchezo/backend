import { UserModel } from "../models/userModel";
import { Request, Response, NextFunction } from "express";
import { catchAsync } from "../utils/catchAsync";
import jwt, { JwtPayload } from "jsonwebtoken";
import { AppError } from "../utils/appErrorr";
import { IUser } from "../models/userModel";
import { sendEmail } from "../utils/email";
import crypto from "crypto";
import { InternalEventModel } from "../models/internalEventModel";
import { AppointmentModel } from "../models/appointmentModel";

export interface AuthenticatedRequest extends Request {
  user?: IUser;
}
export const createAndSendToken = (
  user: IUser,
  statusCode: number,
  res: Response
): void => {
  const JWT_SECRET = process.env.JWT_SECRET;
  const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN;
  const JWT_COOKIES_EXPIRES_IN = process.env.JWT_COOKIES_EXPIRES_IN;

  if (!JWT_SECRET || !JWT_EXPIRES_IN) {
    throw new Error("JWT_SECRET and JWT_EXPIRES_IN must be defined");
  }

  const expiresIn =
    JWT_EXPIRES_IN as `${number}${"ms" | "s" | "m" | "h" | "d" | "w" | "y"}`;

  const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn });
  const cookieOptions = {
    expires: new Date(
      Date.now() +
        parseInt(JWT_COOKIES_EXPIRES_IN ?? "7", 10) * 24 * 60 * 60 * 1000
    ),
    httpOnly: true, // Prevents access from client-side JavaScript
    secure: process.env.NODE_ENV === "production", // Only send over HTTPS in production
  };

  res.cookie("jwt", token, cookieOptions);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, ...userWithoutPassword } = user.toObject();
  res.status(statusCode).json({
    status: "success",
    token,
    data: {
      user: userWithoutPassword,
    },
  });
};
export const signup = catchAsync(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const newUser = new UserModel({
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email: req.body.email,
      password: req.body.password,
      passwordConfirm: req.body.passwordConfirm,
    });

    await newUser.save();
    createAndSendToken(newUser, 201, res);
  }
);

export const login = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // const email = req.body.email
    // const password = req.body.password
    const { email, password } = req.body;

    //1) check if email and password exist
    if (!email || !password) {
      return next(new AppError("Please provide email adn password", 400));
    }
    //2) check if user exist && password is correct
    const user = await UserModel.findOne({ email }).select("+password");
    if (!user || !(await user.correctPassword(password))) {
      return next(new AppError("Incorrect email or password", 401));
    }

    //3) if everything is ok send token to client
    createAndSendToken(user, 200, res);
  }
);

export const authorizeAppointmentAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const user = (req as AuthenticatedRequest).user;
  const appointmentId = req.params.id;

  if (!user) {
    return next(new AppError("You must be logged in.", 401));
  }

  const appointment = await AppointmentModel.findById(appointmentId);

  if (!appointment) {
    return next(new AppError("Appointment not found.", 404));
  }

  const isOwner = appointment.ownerId?.toString() === user.id;
  const isAdmin = user.role === "admin";

  if (!isOwner && !isAdmin) {
    return next(
      new AppError(
        "You do not have permission to modify this appointment.",
        403
      )
    );
  }

  next();
};

export const canUpdateInternalEvent = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const user = req.user;
  const eventId = req.params.id;

  const event = await InternalEventModel.findById(eventId);

  if (!event) {
    return next(new AppError("Internal event not found", 404));
  }

  const isAdmin = user?.role === "admin";
  const isOwner = event.ownerId?.toString() === user?.id;
  const isParticipant = event.sharedWith?.includes(user?.id ?? "");

  if (!isAdmin && !isOwner && !isParticipant) {
    return next(
      new AppError("You do not have permission to update this event", 403)
    );
  }

  next();
};

export const canDeleteInternalEvent = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const user = req.user;
  const eventId = req.params.id;

  const event = await InternalEventModel.findById(eventId);

  if (!event) {
    return next(new AppError("Internal event not found", 404));
  }

  const isAdmin = user?.role === "admin";
  const isOwner = event.ownerId?.toString() === user?.id;

  if (!isAdmin && !isOwner) {
    return next(
      new AppError("You do not have permission to delete this event", 403)
    );
  }

  next();
};

export const protect = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    //1) Getting the token and check if available
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }
    if (!token) {
      return next(
        new AppError("You are not logged in! Please log in to get access", 401)
      );
    }
    //2) verification the token
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET must be defined");
    }

    const verifyToken = (
      token: string,
      secret: string
    ): Promise<JwtPayload> => {
      return new Promise((resolve, reject) => {
        jwt.verify(token, secret, (err, decoded) => {
          if (err) return reject(err);
          resolve(decoded as JwtPayload);
        });
      });
    };

    const decoded = await verifyToken(token, process.env.JWT_SECRET as string);

    //3) if verification is successfull check if user still exists

    const freshUser = await UserModel.findById(decoded.id);
    if (!freshUser) {
      return next(
        new AppError("The user belonging to this token nolonger exist! ", 401)
      );
    }
    //4) Check if user chnaged password after the token was issued
    if (typeof decoded.iat === "number") {
      const passwordChanged = await freshUser.changedPasswordAfter(decoded.iat);
      if (passwordChanged) {
        return next(
          new AppError(
            "User recently changed the password! Please log in again",
            401
          )
        );
      }
    }
    // Grant access to the protected route
    req.user = freshUser;
    next();
  }
);

export const restrictTo = (
  ...allowedRoles: ("user" | "admin" | "worker")[]
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthenticatedRequest).user;

    if (!user) {
      return next(new AppError("You are not logged in.", 401));
    }

    if (!allowedRoles.includes(user.role)) {
      return next(
        new AppError("You do not have permission to perform this action.", 403)
      );
    }

    next(); // ✅ Role is allowed
  };
};

export const forgotPassword = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    //1. get user based on posted email
    const user = await UserModel.findOne({ email: req.body.email });
    if (!user) {
      return next(
        new AppError("There is no user with that email address", 404)
      );
    }
    //2.generate random reset token
    const resetToken = await user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });
    //3.send it to user email
    const resetURL = `${req.protocol}://${req.get("host")}/api/v1/users/resetPassword/${resetToken}`;

    try {
      const message = `Forgot your password? Submit a PATCH request with your new password and passwordConfirm to: ${resetURL}.\nIf you didn´t forget your password, please ignore this email `;
      await sendEmail({
        email: user.email,
        subject: "Your password reset token",
        message,
      });
      res.status(200).json({
        status: "success",
        message: "Token sent to email!",
      });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });

      return next(
        new AppError(
          "There was an error sending the email. Try again later",
          500
        )
      );
    }
  }
);
export const resetPassword = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    //1. get user based on the token
    const hashedToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    const user = await UserModel.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });
    //2. if token has not expired, and there is user, set new password
    if (!user) {
      return next(new AppError("Token is invalid or has expired", 400));
    }

    user.password = req.body.password;
    user.passwordConfirm = req.body.passwordConfirm;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    await user.save();

    //3.update the changedPasswordAt property for the user

    //4.log the user in send JWT
    createAndSendToken(user, 200, res);
  }
);

export const updatePassword = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = await UserModel.findById(req.user!.id).select("+password");

    if (!user || !(await user.correctPassword(req.body.passwordCurrent))) {
      return next(new AppError("Your current password is wrong", 401));
    }

    user.password = req.body.newPassword;
    user.passwordConfirm = req.body.passwordConfirm;

    await user.save();

    createAndSendToken(user, 200, res);
  }
);
