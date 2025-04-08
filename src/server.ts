import app, { startServer } from "./app";
import config from "./config/config";

startServer()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
    });
  })
  .catch((error) => {
    console.error(
      "Failed to start server due to Firebase initialization error:",
      error,
    );
    process.exit(1);
  });
