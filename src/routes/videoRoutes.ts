import { Router } from "express";
import multer from "multer";
import * as os from "os";
import { authenticateUser } from "../middleware/authMiddleware";
import {
  getVideoOptions,
  getUserVideoOptions,
  searchVideoOptions,
  uploadVideo,
  getVideoDetails,
  deleteVideo,
  getComments,
  postComment,
  deleteComment,
  incrementViewCount,
  incrementLikeDislikeCount,
  generateThumbnail,
} from "../controllers/videoController";

const videoRouter = Router();

videoRouter
  .get("/", authenticateUser, getVideoOptions)
  .get("/user/:userId", authenticateUser, getUserVideoOptions)
  .get("/search", authenticateUser, searchVideoOptions)
  .post("/", authenticateUser, uploadVideo)
  .post("/thumbnail", authenticateUser, generateThumbnail)
  .get("/:videoId", authenticateUser, getVideoDetails)
  .delete("/:videoId", authenticateUser, deleteVideo)
  .get("/:videoId/comments", authenticateUser, getComments)
  .post("/:videoId/comments", authenticateUser, postComment)
  .delete("/:videoId/comments/:commentId", authenticateUser, deleteComment)
  .post("/:videoId/view", authenticateUser, incrementViewCount)
  .post("/:videoId/:type", authenticateUser, incrementLikeDislikeCount);

export default videoRouter;
