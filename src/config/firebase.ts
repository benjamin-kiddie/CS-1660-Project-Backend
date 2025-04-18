import * as admin from "firebase-admin";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { ServiceAccount } from "firebase-admin";

const secretClient = new SecretManagerServiceClient();

async function getSecret(secretName: string): Promise<string> {
  const projectId = "scufftube-video-platform";
  const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;

  const [version] = await secretClient.accessSecretVersion({ name });
  return version.payload?.data?.toString() || "";
}

async function initializeFirebase() {
  try {
    console.log("Initializing Firebase...");

    // Fetch secrets
    const [clientEmail, privateKey] = await Promise.all([
      getSecret("firebase-client-email"),
      getSecret("firebase-private-key"),
    ]);

    // Assemble service account object
    const serviceAccount: ServiceAccount = {
      projectId: "scufftube-video-platform",
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, "\n"),
    };

    // Only initialize Firebase once
    if (!admin.apps.length) {
      console.log("Initializing Firebase Admin SDK...");
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: "scufftube-video-platform.firebasestorage.app",
      });
      console.log("Firebase initialized successfully.");
    } else {
      console.log("Firebase already initialized.");
    }
  } catch (error) {
    console.error("Error initializing Firebase:", error);
    throw error;
  }
}

export { initializeFirebase };
export const db = () => admin.firestore();
export const auth = () => admin.auth();
export const storage = () => admin.storage();
export default admin;
