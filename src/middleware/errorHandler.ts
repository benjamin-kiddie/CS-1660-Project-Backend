import { Request, Response, NextFunction } from "express";

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const status =
    error instanceof Error && "status" in error ? (error as any).status : 500;
  const message =
    error instanceof Error ? error.message : "Internal Server Error";

  res.status(status).json({
    error: message,
  });
}
