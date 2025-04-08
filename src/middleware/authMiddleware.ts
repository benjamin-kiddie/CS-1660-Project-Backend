import { Request, Response, NextFunction } from "express";
import admin from "firebase-admin";
import { auth } from "../config/firebase";

declare global {
  namespace Express {
    interface Request {
      user?: admin.auth.DecodedIdToken;
    }
  }
}

/**
 * Middleware function to authenticate users.
 * @param {Request} req Incoming request.
 * @param {Response} res Response to this request.
 * @param {NextFunction} next The function to run after this middleware.
 */
export async function authenticateUser(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized: No token provided" });
      return;
    }

    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await auth().verifyIdToken(token);
    req.user = decodedToken;
    return next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
}
