import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";

process.on("uncaughtException", (err: unknown) => {
  console.error("Unhandled exception! Shutting down...");

  if (err instanceof Error) {
    console.error(err.name, err.message);
    process.exit(1);
  } else {
    console.error("Unknown error", err);
  }
});

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../config.env") });

import app from "./app";

if (!process.env.DATABASE || !process.env.DATABASE_PASSWORD) {
  throw new Error("Missing DATABASE or DATABASE_PASSWORD in config.env");
}

// Create MongoDB connection string
const DB = process.env.DATABASE.replace(
  "<PASSWORD>",
  process.env.DATABASE_PASSWORD
);

// Connect to MongoDB
mongoose.connect(DB).then(() => console.log("DB connection successful!"));

// Start Express server
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`App running on port ${PORT}...`)
})



process.on("unhandledRejection", (err: unknown) => {
  console.error("Unhandled rejection! Shutting down...");

  if (err instanceof Error) {
    console.error(err.name, err.message);
  } else {
    console.error("Unknown error", err);
  }

  if (server) {
    server.close(() => {
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});
