import { Router, Request, Response } from "express";
import multer from "multer";
import * as os from "os";
import * as fs from "fs";
import { db, storage } from "../config/firebase";
import { authenticateUser } from "../middleware/authMiddleware";

const router = Router();

// use multer for file uploads
const upload = multer({ dest: os.tmpdir() });

router.post(
  "/video",
  authenticateUser,
  upload.fields([
    { name: "videoFile", maxCount: 1 },
    { name: "thumbnailFile", maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    let videoFile: Express.Multer.File | null = null;
    let thumbnailFile: Express.Multer.File | null = null;

    try {
      // parse json data
      const { title, description, uploaderUsername } = req.body;
      if (!title || !uploaderUsername) {
        res.status(400).json({ error: "Missing required fields" });
        return;
      }

      // check files
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (!files.videoFile || !files.thumbnailFile) {
        res.status(400).json({ error: "Missing required files" });
        return;
      }
      videoFile = files.videoFile[0];
      thumbnailFile = files.thumbnailFile[0];

      // add document to video collection in Firestore, save id
      const videoData = {
        title,
        description,
        uploader: uploaderUsername,
        views: 0,
        uploadDate: new Date().toISOString(),
      };
      const docRef = await db().collection("video").add(videoData);
      const videoId = docRef.id;

      // put video in bucket
      const bucket = storage().bucket();
      const videoDestPath = `videos/${videoId}`;
      await bucket.upload(videoFile.path, {
        destination: videoDestPath,
        metadata: {
          contentType: videoFile.mimetype,
          metadata: {
            originalFileName: videoFile.originalname,
          },
        },
      });

      // put thumbnail in bucket
      const thumbnailDestPath = `thumbnails/${videoId}`;
      await bucket.upload(thumbnailFile.path, {
        destination: thumbnailDestPath,
        metadata: {
          contentType: thumbnailFile.mimetype,
          metadata: {
            originalFilename: thumbnailFile.originalname,
          },
        },
      });

      res.status(200).json({
        message: "Video and thumbnail uploaded successfully",
        videoId,
      });
    } catch (error) {
      console.error("Error uploading video:", error);
      res.status(500).json({
        error: "Failed to upload video",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      if (videoFile) fs.unlinkSync(videoFile.path);
      if (thumbnailFile) fs.unlinkSync(thumbnailFile.path);
    }
  },
);

export default router;
