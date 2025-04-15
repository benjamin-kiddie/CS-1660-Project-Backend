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
This project is built using the [Express.js](https://expressjs.com/) framework for creating a robust and scalable RESTful API. Below are the key technologies and services used in this backend:

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

4. **Compile the Project**:
  Compile the TypeScript files into JavaScript:
    ```bash
    npx tsc
    ```

5. **Run the Server**:
  Start the server using Node.js:
    ```bash
    node /dist/server.js
    ```

6. **Access the Backend**:
  The backend will be running on `http://localhost:3000`

---