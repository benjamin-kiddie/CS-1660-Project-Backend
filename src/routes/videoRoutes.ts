import { Router } from "express";
import multer from "multer";
import * as os from "os";
import { authenticateUser } from "../middleware/authMiddleware";
import {
  deleteComment,
  getComments,
  getVideoDetails,
  getVideoOptions,
  searchVideoOptions,
  getUserVideoOptions,
  incrementViewCount,
  postComment,
  uploadVideo,
  incrementLikeDislikeCount,
} from "../controllers/videoController";
import { get } from "http";

const videoRouter = Router();

const upload = multer({ dest: os.tmpdir() });

videoRouter
  .post(
    "/",
    authenticateUser,
    upload.fields([
      { name: "videoFile", maxCount: 1 },
      { name: "thumbnailFile", maxCount: 1 },
    ]),
    uploadVideo,
  )
  .get("/", authenticateUser, getVideoOptions)
  .get("/:userId", authenticateUser, getUserVideoOptions)
  .get("/search", authenticateUser, searchVideoOptions)
  .get("/:videoId", authenticateUser, getVideoDetails)
  .post("/:videoId/view", authenticateUser, incrementViewCount)
  .get("/:videoId/comments", authenticateUser, getComments)
  .post("/:videoId/comments", authenticateUser, postComment)
  .delete("/:videoId/comments/:commentId", authenticateUser, deleteComment)
  .post("/:videoId/:type", authenticateUser, incrementLikeDislikeCount);

export default videoRouter;
