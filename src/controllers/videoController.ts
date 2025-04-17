import * as fs from "fs";
import path from "path";
import seedrandom from "seedrandom";
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
  numComments: number;
  likes: number;
  dislikes: number;
  userLikeStatus: "like" | "dislike" | null;
  videoSignedUrl: string;
};

type CommentDetails = {
  id: string;
  comment: string;
  commenterId: string;
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
      likes: 0,
      dislikes: 0,
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

    res.status(201).json({
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
 * Uses seedrandom to "randomly" return video options for discoverability while allowing pagination.
 * @param {Request} req Request object.
 * @param {Response} res Response object.
 */
export async function getVideoOptions(req: Request, res: Response) {
  const seed = (req.query.seed as string)?.toLowerCase() || "";
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const excludeId = req.query.excludeId as string | undefined;

  try {
    const videoCollection = db().collection("video");
    let query: FirebaseFirestore.Query = videoCollection;
    if (excludeId) {
      query = query.where(
        admin.firestore.FieldPath.documentId(),
        "!=",
        excludeId,
      );
    }

    // fetch the videos
    const snapshot = await query.get();

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

    // use seed for consistent randomization across a session
    const rng = seedrandom(String(seed) || Date.now().toString());
    const randomizedVideos = videoOptions.sort(() => rng() - 0.5);

    // paginate results
    const startIndex = (page - 1) * limit;
    const paginatedVideos = randomizedVideos.slice(
      startIndex,
      startIndex + limit,
    );

    res.status(200).json({
      videoOptions: paginatedVideos,
      hasMore: startIndex + limit < randomizedVideos.length,
    });
  } catch (error) {
    console.error("Error fetching video options:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Retrieves user's video options from Firestore and generates signed URLs for thumbnails.
 * Uses user ID to return user's uploaded video options.
 * @param {Request} req Request object.
 * @param {Response} res Response object.
 */
export async function getUserVideoOptions(req: Request, res: Response) {
  const { userId } = req.params;
  if (!userId) {
    res.status(400).json({ error: "Missing user ID" });
    return;
  }
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;

  try {
    // we already know who the uploader is, so get their details
    const { userDisplayName: uploaderDisplayName, userPfp: uploaderPfp } =
      await getUserDetails(userId);

    const videoCollection = db().collection("video");
    let query: FirebaseFirestore.Query = videoCollection
      .where("uploader", "==", userId)
      .orderBy("uploadTimestamp", "desc");

    // fetch the videos
    const snapshot = await query.get();

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

    // paginate results
    const startIndex = (page - 1) * limit;
    const paginatedVideos = videoOptions.slice(startIndex, startIndex + limit);

    res.status(200).json({
      videoOptions: paginatedVideos,
      hasMore: startIndex + limit < videoOptions.length,
    });
  } catch (error) {
    console.error("Error fetching video options:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Retrieves videos from firestore that match the search query.
 * Uses in-memory filtering and pagination (not recommended for large datasets).
 * @param {Request} req Request object.
 * @param {Response} res Response object.
 */
export async function searchVideoOptions(req: Request, res: Response) {
  const query = (req.query.query as string)?.toLowerCase() || "";
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;

  try {
    // fetch only title and id before filtering, order by views
    const snapshot = await db()
      .collection("video")
      .orderBy("views", "desc")
      .get();

    const allVideos = snapshot.docs.map((doc) => ({
      id: doc.id,
      title: doc.data().title,
    }));

    // filter videos by title case-insensitively
    const filtered = allVideos.filter((video) =>
      video.title?.toLowerCase().includes(query),
    );

    // paginate the filtered results
    const start = (page - 1) * limit;
    const paginated = filtered.slice(start, start + limit);

    // fetch full video details for the paginated results
    const videoOptions = await Promise.all(
      paginated.map(async (video) => {
        const videoDoc = await db().collection("video").doc(video.id).get();
        const videoData = videoDoc.data();

        // get thumbnail signed link
        const [thumbnailSignedLink] = await storage()
          .bucket()
          .file(`thumbnails/${video.id}`)
          .getSignedUrl({
            action: "read",
            expires: Date.now() + 60 * 60 * 1000, // valid for 1 hour
          });

        // get uploader display name and profile picture
        const { userDisplayName: uploaderDisplayName, userPfp: uploaderPfp } =
          await getUserDetails(videoData?.uploader);

        return {
          id: video.id,
          title: videoData?.title,
          uploaderDisplayName: uploaderDisplayName || "",
          uploaderPfp: uploaderPfp || "",
          uploadTimestamp: videoData?.uploadTimestamp,
          views: videoData?.views,
          thumbnailSignedLink,
        };
      }),
    );

    res.json({
      videoOptions: videoOptions,
      hasMore: start + limit < filtered.length,
    });
  } catch (error) {
    console.error("Error searching videos:", error);
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

    // count the number of comments in the comments subcollection
    const commentsSnapshot = await db()
      .collection("video")
      .doc(videoId)
      .collection("comments")
      .get();
    const numComments = commentsSnapshot.size;

    // get user's reaction status
    let userLikeStatus: "like" | "dislike" | null = null;
    if (req.user) {
      const userId = (req.user as any).uid;
      const reactionDoc = await db()
        .collection("video")
        .doc(videoId)
        .collection("reactions")
        .doc(userId)
        .get();
      userLikeStatus = reactionDoc.exists ? reactionDoc.data()?.type : null;
    }

    // Construct response object
    const videoDetails: VideoDetails = {
      id: videoId,
      title: videoData.title,
      description: videoData.description,
      uploaderDisplayName,
      uploaderPfp,
      uploadTimestamp: videoData.uploadTimestamp,
      views: videoData.views,
      numComments,
      likes: videoData.likes,
      dislikes: videoData.dislikes,
      userLikeStatus,
      videoSignedUrl,
    };

    res.status(201).json(videoDetails);
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
    res.status(204).end();
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
      .limit(11);

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
      snapshot.docs.slice(0, 10).map(async (doc) => {
        const { commenterId, comment, timestamp } = doc.data();
        const { userDisplayName, userPfp } = await getUserDetails(commenterId);
        return {
          id: doc.id,
          comment,
          commenterId: commenterId,
          commenterDisplayName: userDisplayName || "",
          commenterPfp: userPfp || "",
          commentTimestamp: timestamp,
        };
      }),
    );

    res.status(200).json({ comments, hasMore: snapshot.docs.length > 10 });
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
    const timestamp = new Date().toISOString();
    const commentData = {
      comment,
      commenterId,
      timestamp: timestamp,
    };
    const commentRef = await db()
      .collection("video")
      .doc(videoId)
      .collection("comments")
      .add(commentData);

    // assemble new comment
    const { userDisplayName, userPfp } = await getUserDetails(commenterId);
    const newComment: CommentDetails = {
      id: commentRef.id,
      comment,
      commenterId,
      commenterDisplayName: userDisplayName || "",
      commenterPfp: userPfp || "",
      commentTimestamp: timestamp,
    };
    res.status(201).json(newComment);
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
    console.log("deleted comment, preparing to respond.");
    res.status(204).end();
  } catch (error) {
    console.error("Error deleting comment:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Increment the like/dislike count of a given video.
 * @param {Request} req Request object.
 * @param {Response} res Response object.
 */
export async function incrementLikeDislikeCount(
  req: Request,
  res: Response,
): Promise<void> {
  const { videoId, type } = req.params;
  if (!videoId) {
    res.status(400).json({ error: "Missing video ID" });
    return;
  }

  if (type !== "like" && type !== "dislike") {
    res
      .status(400)
      .json({ error: "Invalid type - must be 'like' or 'dislike'" });
    return;
  }

  const userId = (req.user as any).uid;

  try {
    const videoRef = db().collection("video").doc(videoId);
    const reactionRef = videoRef.collection("reactions").doc(userId);

    const reactionDoc = await reactionRef.get();
    const currentReaction = reactionDoc.exists
      ? reactionDoc.data()?.type
      : null;

    let likeDelta = 0;
    let dislikeDelta = 0;

    if (currentReaction === type) {
      await reactionRef.delete();
      likeDelta = type === "like" ? -1 : 0;
      dislikeDelta = type === "dislike" ? -1 : 0;
    } else {
      await reactionRef.set({ type });

      if (currentReaction) {
        likeDelta += currentReaction === "like" ? -1 : 0;
        dislikeDelta += currentReaction === "dislike" ? -1 : 0;
      }

      likeDelta += type === "like" ? 1 : 0;
      dislikeDelta += type === "dislike" ? 1 : 0;
    }

    await videoRef.update({
      likes: admin.firestore.FieldValue.increment(likeDelta),
      dislikes: admin.firestore.FieldValue.increment(dislikeDelta),
    });

    res.status(200).json({ message: "Reaction updated" });
  } catch (error) {
    console.error("Error updating reaction:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
