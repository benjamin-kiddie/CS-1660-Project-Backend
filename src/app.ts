import express from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler } from "./middleware/errorHandler";
import { initializeFirebase } from "./config/firebase";
import videoRouter from "./routes/videoRoutes";

const app = express();

const corsOptions = {
  origin: "http://localhost:5173",
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

export async function startServer() {
  try {
    await initializeFirebase();
    app.use(errorHandler);
    app.use("/video", videoRouter);
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

export default app;
