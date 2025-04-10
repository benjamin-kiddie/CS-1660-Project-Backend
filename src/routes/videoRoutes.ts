import { Router } from "express";
import multer from "multer";
import * as os from "os";
import { authenticateUser } from "../middleware/authMiddleware";
import {
  deleteComment,
  getComments,
  getVideoDetails,
  getVideoOptions,
  incrementViewCount,
  postComment,
  uploadVideo,
} from "../controllers/videoController";

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
  .get("/:videoId", authenticateUser, getVideoDetails)
  .post("/:videoId/view", authenticateUser, incrementViewCount)
  .get("/:videoId/comments", authenticateUser, getComments)
  .post("/:videoId/comments", authenticateUser, postComment)
  .delete("/:videoId/comments/:commentId", authenticateUser, deleteComment);

export default videoRouter;
