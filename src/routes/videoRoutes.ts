import { Router } from "express";
import multer from "multer";
import * as os from "os";
import { authenticateUser } from "../middleware/authMiddleware";
import { uploadVideo } from "../controllers/videoController";

const videoRouter = Router();

const upload = multer({ dest: os.tmpdir() });

videoRouter.post(
  "/",
  authenticateUser,
  upload.fields([
    { name: "videoFile", maxCount: 1 },
    { name: "thumbnailFile", maxCount: 1 },
  ]),
  uploadVideo,
);

export default videoRouter;
