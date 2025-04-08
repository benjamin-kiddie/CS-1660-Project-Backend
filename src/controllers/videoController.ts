import * as fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { Request, Response } from "express";
import { db, storage } from "../config/firebase";
import { auth } from "firebase-admin";

// Type representing video options that can be shown to user.
type VideoOption = {
  id: string;
  title: string;
  uploaderDisplayName: string;
  uploaderPfp: string;
  uploadDate: string;
  views: number;
  thumbnailSignedLink: string;
};

type VideoDetails = {
  id: string;
  title: string;
  description: string;
  uploaderDisplayName: string;
  uploaderPfp: string;
  uploadDate: string;
  views: number;
  videoSignedUrl: string;
};

const execAsync = promisify(exec);

/**
 * Helper function to fetch uploader details.
 * @param {string} uploaderId ID of the uploading user.
 * @returns { uploaderDisplayName: string; uploaderPfp: string } Display name and link to PFP.
 */
async function getUploaderDetails(
  uploaderId: string,
): Promise<{ uploaderDisplayName: string; uploaderPfp: string }> {
  const userRecord = await auth().getUser(uploaderId);
  const uploaderDisplayName = userRecord.displayName || "";
  const uploaderPfp = userRecord.photoURL || "";
  return { uploaderDisplayName, uploaderPfp };
}

/**
 * Uploads a video and its thumbnail to Firebase Storage and adds metadata to Firestore.
 * @param {Request} req Request object.
 * @param {Response} res Response object.
 */
export async function uploadVideo(req: Request, res: Response) {
  let videoFile: Express.Multer.File | null = null;
  let thumbnailFile: Express.Multer.File | null = null;
  let generatedThumbnailPath: string | null = null;

  try {
    // parse JSON data
    const { title, description, uploader } = req.body;
    if (!title || !uploader) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    // check files
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    if (!files.videoFile) {
      res.status(400).json({ error: "Missing required file" });
      return;
    }
    videoFile = files.videoFile[0];
    thumbnailFile = files.thumbnailFile ? files.thumbnailFile[0] : null;

    // if no thumbnail file is provider, generate one
    if (!thumbnailFile) {
      const thumbnailPath = `thumbnail-${Date.now()}.jpg`;
      generatedThumbnailPath = path.join("/tmp", thumbnailPath);
      await execAsync(
        `ffmpeg -i ${videoFile.path} -ss 00:00:01.000 -vframes 1 ${generatedThumbnailPath}`,
      );
      if (!fs.existsSync(generatedThumbnailPath)) {
        throw new Error("Failed to generate thumbnail");
      }
    }

    // add document to video collection in Firestore, save ID
    const videoData = {
      title,
      description,
      uploader,
      views: 0,
      uploadDate: new Date().toISOString(),
    };
    const docRef = await db().collection("video").add(videoData);
    const videoId = docRef.id;

    // put video in Firebase storage bucket
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

    // put thumbnail in Firebase storage bucket
    const thumbnailDestPath = `thumbnails/${videoId}`;
    await bucket.upload(
      thumbnailFile ? thumbnailFile.path : generatedThumbnailPath || "",
      {
        destination: thumbnailDestPath,
        metadata: {
          contentType: thumbnailFile ? thumbnailFile.mimetype : "image/jpeg",
          metadata: {
            originalFilename: thumbnailFile
              ? thumbnailFile.originalname
              : "generated-thumbnail.jpg",
          },
        },
      },
    );

    res.status(200).json({
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
    if (generatedThumbnailPath && fs.existsSync(generatedThumbnailPath)) {
      fs.unlinkSync(generatedThumbnailPath);
    }
  }
}

/**
 * Retrieves video options from Firestore and generates signed URLs for thumbnails.
 * @param {Request} _req Request object.
 * @param {Response} res Response object.
 */
export async function getVideoOptions(_req: Request, res: Response) {
  // TODO: Implement semi-random ordering for variety
  // TODO: Implement pagination for large number of videos
  try {
    const videoCollection = db().collection("video");
    const snapshot = await videoCollection.get();

    const videoOptions: VideoOption[] = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const videoData = doc.data();
        const videoId = doc.id;

        // get thumbnail signed link
        const [thumbnailSignedLink] = await storage()
          .bucket()
          .file(`thumbnails/${videoId}`)
          .getSignedUrl({
            action: "read",
            expires: Date.now() + 60 * 60 * 1000, // valid for 1 hour
          });

        // get uploader display name and pfp
        const { uploaderDisplayName, uploaderPfp } = await getUploaderDetails(
          videoData.uploader,
        );

        return {
          id: videoId,
          title: videoData.title,
          uploaderDisplayName: uploaderDisplayName || "",
          uploaderPfp: uploaderPfp || "",
          uploadDate: videoData.uploadDate,
          views: videoData.views,
          thumbnailSignedLink,
        };
      }),
    );

    res.status(200).json({
      videoOptions: videoOptions,
    });
  } catch (error) {
    console.error("Error fetching video options:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Retrieves detailed information about a video, including a signed video URL and description.
 * @param {Request} req Request object.
 * @param {Response} res Response object.
 */
export async function getVideoDetails(req: Request, res: Response) {
  const { videoId } = req.params;
  if (!videoId) {
    res.status(400).json({ error: "Missing video ID" });
    return;
  }

  try {
    // get video metadata
    const videoDoc = await db().collection("video").doc(videoId).get();
    if (!videoDoc.exists) {
      res.status(404).json({ error: "Video not found" });
      return;
    }
    const videoData = videoDoc.data();
    if (!videoData) {
      res.status(500).json({ error: "Failed to retrieve video data" });
      return;
    }

    // get video signed link
    const [videoSignedUrl] = await storage()
      .bucket()
      .file(`videos/${videoId}`)
      .getSignedUrl({
        action: "read",
        expires: Date.now() + 60 * 60 * 1000, // valid for 1 hour
      });

    // get uploader display name and pfp
    const { uploaderDisplayName, uploaderPfp } = await getUploaderDetails(
      videoData.uploader,
    );

    // Construct response object
    const videoDetails: VideoDetails = {
      id: videoId,
      title: videoData.title,
      description: videoData.description,
      uploaderDisplayName,
      uploaderPfp,
      uploadDate: videoData.uploadDate,
      views: videoData.views,
      videoSignedUrl,
    };

    res.status(200).json(videoDetails);
  } catch (error) {
    console.error("Error fetching video details:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
