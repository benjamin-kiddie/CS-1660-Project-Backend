# CS-1660 Project Backend

This repository contains the backend for the Scufftube Video Platform.

Scufftube is a video platform designed to allow users to view and interact with video content created by other users, as well as upload their own content.

Below, you will find details about setting up the project for local development, technical details, and an architecture diagram for the project as a whole.

---

## Table of Contents
- [Architecture](#architecture)
- [Technical Details](#technical-details)
- [Endpoints](#endpoints)
- [Setup for Local Development](#setup-for-local-development)

---

## Architecture
![Architecture diagram](architecture_diagram.svg)

---

## Technical Details
This project is built using the [Express.js](https://expressjs.com/) framework for creating a robust and scalable RESTful(ish) API. Below are the key technologies and services used in this backend:

- **Express.js**: Provides the core framework for routing, middleware, and handling HTTP requests and responses.
- **Firebase Admin SDK**: Used for interacting with Firebase services, including Firestore, Cloud Storage, and authentication.
- **Firestore**: A NoSQL cloud database used to store video metadata, user data, and comments. It supports real-time updates and scalable querying.
- **Google Cloud Storage**: Used to store video files and thumbnails securely.
- **Google Identity Platform**: Used to verify token validity on incoming requests and fetch user information.
- **Google Cloud Secrets Manager**: Manages sensitive configuration data, such as Firebase service account credentials, ensuring secure access to these secrets.
- **Seedrandom**: Used to generate consistent randomization for video discoverability while maintaining pagination.

This backend is designed to integrate seamlessly with the frontend, providing endpoints for video uploads, retrieval, and user interactions such as comments, likes, and views.

---

## Endpoints
The backend provides the following endpoints for interacting with the Scufftube platform:

### Video Endpoints
#### **GET /video/**
- **Description**: Retrieve a list of video options for discoverability.
- **Authentication**: Required.
- **Query Parameters**:
  - `seed` (optional): A string used to randomize the video list consistently.
  - `page` (optional): The page number for pagination (default: 1).
  - `limit` (optional): The number of videos per page (default: 10).
  - `excludeId` (optional): Exclude a specific video ID from the results.

#### **GET /video/user/:userId**
- **Description**: Retrieve a list of videos uploaded by a specific user.
- **Authentication**: Required.
- **Path Parameters**:
  - `userId`: The ID of the user whose videos are being retrieved.
- **Query Parameters**:
  - `page` (optional): The page number for pagination (default: 1).
  - `limit` (optional): The number of videos per page (default: 10).

#### **GET /video/search**
- **Description**: Search for videos by title.
- **Authentication**: Required.
- **Query Parameters**:
  - `query`: The search term.
  - `page` (optional): The page number for pagination (default: 1).
  - `limit` (optional): The number of videos per page (default: 10).

#### **POST /video/**
- **Description**: Upload a new video and generate signed URLs for uploading the video and thumbnail.
- **Authentication**: Required.
- **Request Body**:
  - `title` (required): The title of the video.
  - `description` (optional): A description of the video.
  - `videoType` (required): The MIME type of the video file.
  - `thumbnailType` (optional): The MIME type of the thumbnail file.

#### **POST /video/thumbnail**
- **Description**: Generate a thumbnail for a video using `ffmpeg`.
- **Authentication**: Required.
- **Request Body**:
  - `videoId` (required): The ID of the video.

#### **GET /video/:videoId**
- **Description**: Retrieve detailed information about a specific video.
- **Authentication**: Required.
- **Path Parameters**:
  - `videoId`: The ID of the video.

#### **DELETE /video/:videoId**
- **Description**: Delete a video and its associated data (e.g., comments, reactions).
- **Authentication**: Required.
- **Path Parameters**:
  - `videoId`: The ID of the video.

#### **POST /video/:videoId/view**
- **Description**: Increment the view count of a video.
- **Authentication**: Required.
- **Path Parameters**:
  - `videoId`: The ID of the video.

#### **POST /video/:videoId/:type**
- **Description**: Increment the like or dislike count of a video.
- **Authentication**: Required.
- **Path Parameters**:
  - `videoId`: The ID of the video.
  - `type`: Either `like` or `dislike`.

### Comment Endpoints
#### **GET /video/:videoId/comments**
- **Description**: Retrieve paginated comments for a video.
- **Authentication**: Required.
- **Path Parameters**:
  - `videoId`: The ID of the video.
- **Query Parameters**:
  - `lastCommentId` (optional): The ID of the last comment from the previous page.

#### **POST /video/:videoId/comments**
- **Description**: Post a new comment on a video.
- **Authentication**: Required.
- **Path Parameters**:
  - `videoId`: The ID of the video.
- **Request Body**:
  - `comment` (required): The content of the comment.
  - `commenterId` (required): The ID of the user posting the comment.

#### **DELETE /video/:videoId/comments/:commentId**
- **Description**: Delete a comment from a video.
- **Authentication**: Required.
- **Path Parameters**:
  - `videoId`: The ID of the video.
  - `commentId`: The ID of the comment.

--- 

## Setup for Local Development
Follow these steps to set up the project for local development:

1. **Clone the Repository**:
    ```bash
    git clone https://github.com/benjamin-kiddie/CS-1660-Project-Backend.git
    cd CS-1660-Project-Backend
    ```

2. **Ensure Application Has Access to Credentials**
  Because this application runs using Google Cloud Services, you will need to have an environment variable `GOOGLE_APPLICATION_CREDENTIALS` specifying where your credentials JSON file is located.
    ```bash
    export GOOGLE_APPLICATION_CREDENTIALS=<path_to_credentials.json>
    ```


3. **Install Dependencies**:
  Ensure you have [Node.js](https://nodejs.org) installed. Then run:
    ```bash
    npm install
    ```

4. **Run the Server**:
  Start the server using the provided npm command:
    ```bash
    npm run dev
    ```

5. **Access the Backend**:
  The backend will be running on `http://localhost:8080`

---