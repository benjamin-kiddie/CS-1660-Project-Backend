import express from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler } from "./middleware/errorHandler";
import { initializeFirebase } from "./config/firebase";
import videoRouter from "./routes/videoRoutes";
import { errorLogger } from "./middleware/errorLogger";

const app = express();

const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://scufftube-866186459758.us-central1.run.app",
  ],
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

export async function startServer() {
  try {
    await initializeFirebase();
    app.use("/video", videoRouter).use(errorLogger).use(errorHandler);
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

export default app;
