import { Request, Response, NextFunction } from "express";

export function errorLogger(
  error: unknown,
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (error instanceof Error) {
    console.error("Error occurred:", {
      message: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
    });
  } else {
    console.error("Error occurred:", {
      message: "Unknown error",
      path: req.path,
      method: req.method,
    });
  }

  next(error);
}
