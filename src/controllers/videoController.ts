import * as fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { Request, Response } from "express";
import admin, { db, storage } from "../config/firebase";
import { auth } from "firebase-admin";

// Type representing video options that can be shown to user.
type VideoOption = {
  id: string;
  title: string;
  uploaderDisplayName: string;
  uploaderPfp: string;
  uploadTimestamp: string;
  views: number;
  thumbnailSignedLink: string;
};

// Type representing details about a video the viewer has requested to watch.
type VideoDetails = {
  id: string;
  title: string;
  description: string;
  uploaderDisplayName: string;
  uploaderPfp: string;
  uploadTimestamp: string;
  views: number;
  videoSignedUrl: string;
};

type CommentDetails = {
  id: string;
  comment: string;
  commenterDisplayName: string;
  commenterPfp: string;
  commentTimestamp: string;
};

const execAsync = promisify(exec);

/**
 * Helper function to fetch uploader details.
 * @param {string} userId ID of the uploading user.
 * @returns { uploaderDisplayName: string; uploaderPfp: string } Display name and link to PFP.
 */
async function getUserDetails(
  userId: string,
): Promise<{ userDisplayName: string; userPfp: string }> {
  const userRecord = await auth().getUser(userId);
  const userDisplayName = userRecord.displayName || "";
  const userPfp = userRecord.photoURL || "";
  return { userDisplayName: userDisplayName, userPfp: userPfp };
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
        const { userDisplayName: uploaderDisplayName, userPfp: uploaderPfp } =
          await getUserDetails(videoData.uploader);

        return {
          id: videoId,
          title: videoData.title,
          uploaderDisplayName: uploaderDisplayName || "",
          uploaderPfp: uploaderPfp || "",
          uploadTimestamp: videoData.uploadTimestamp,
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
    const { userDisplayName: uploaderDisplayName, userPfp: uploaderPfp } =
      await getUserDetails(videoData.uploader);

    // Construct response object
    const videoDetails: VideoDetails = {
      id: videoId,
      title: videoData.title,
      description: videoData.description,
      uploaderDisplayName,
      uploaderPfp,
      uploadTimestamp: videoData.uploadTimestamp,
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

/**
 * Increment the view count of a given video.
 * @param {Request} req Request object.
 * @param {Response} res Response object.
 */
export async function incrementViewCount(
  req: Request,
  res: Response,
): Promise<void> {
  const { videoId } = req.params;
  if (!videoId) {
    res.status(400).json({ error: "Missing video ID" });
    return;
  }

  try {
    const videoRef = db().collection("video").doc(videoId);
    await videoRef.update({
      views: admin.firestore.FieldValue.increment(1),
    });
    res.status(200).json({ message: "View count incremented" });
  } catch (error) {
    console.error("Error incrementing view count:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Retrieves paginated comments for a video.
 * @param {Request} req Request object.
 * @param {Response} res Response object.
 */
export async function getComments(req: Request, res: Response) {
  const { videoId } = req.params;
  const { lastCommentId } = req.query;
  if (!videoId) {
    res.status(400).json({ error: "Missing video ID" });
    return;
  }

  try {
    // query firebase for 10 comments, ordered by timestamp
    let query = db()
      .collection("video")
      .doc(videoId)
      .collection("comments")
      .orderBy("timestamp", "desc")
      .limit(Number(10));

    // if request includes lastCommentId, start after that comment
    if (lastCommentId) {
      const lastCommentDoc = await db()
        .collection("video")
        .doc(videoId)
        .collection("comments")
        .doc(lastCommentId as string)
        .get();
      if (lastCommentDoc.exists) {
        query = query.startAfter(lastCommentDoc);
      }
    }

    const snapshot = await query.get();
    const comments: CommentDetails[] = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const { commenterId, comment, timestamp } = doc.data();
        const { userDisplayName, userPfp } = await getUserDetails(commenterId);
        return {
          id: doc.id,
          comment,
          commenterDisplayName: userDisplayName || "",
          commenterPfp: userPfp || "",
          commentTimestamp: timestamp,
        };
      }),
    );

    res.status(200).json({ comments });
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Posts a comment to a video.
 * @param {Request} req Request object.
 * @param {Response} res Response object.
 */
export async function postComment(req: Request, res: Response) {
  const { videoId } = req.params;
  const { comment, commenterId } = req.body;
  if (!videoId || !comment || !commenterId) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    const commentData = {
      comment,
      commenterId,
      timestamp: new Date().toISOString(),
    };
    await db()
      .collection("video")
      .doc(videoId)
      .collection("comments")
      .add(commentData);
    res.status(200).json({ message: "Comment posted successfully" });
  } catch (error) {
    console.error("Error posting comment:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Deletes a comment from a video.
 * @param {Request} req Request object.
 * @param {Response} res Response object.
 */
export async function deleteComment(req: Request, res: Response) {
  const { videoId, commentId } = req.params;
  if (!videoId || !commentId) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    await db()
      .collection("video")
      .doc(videoId)
      .collection("comments")
      .doc(commentId)
      .delete();
    res.status(200).json({ message: "Comment deleted successfully" });
  } catch (error) {
    console.error("Error deleting comment:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
