const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");

// Import routes
const authRoutes = require("./src/routes/auth");
const postRoutes = require("./src/routes/post");
const userRoutes = require("./src/routes/userRoutes");
const messageRoutes = require("./src/routes/messageRoutes");


const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      process.env.FRONTEND_URL || "http://localhost:5173",
      "https://mesh-blush.vercel.app",
      "https://mesh-blush.vercel.app/",
      "https://mezzzzhh-production.up.railway.app",
    ],
    credentials: true,
  },
});
app.set("io", io);

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL || "http://localhost:5173",
      "https://mesh-blush.vercel.app",
      "https://mesh-blush.vercel.app/",
      "https://mezzzzhh-production.up.railway.app",
    ],
    credentials: true,
  })
);
app.use(morgan("combined"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});
app.use("/api/", limiter);


// Database connection
console.log(`Attempting to connect to MongoDB... URI loaded: ${!!process.env.MONGODB_URI}`);
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/mesh")
  .then(() => {
    console.log("✅ Connected to MongoDB");
  })
  .catch((error) => {
    console.error("❌ MongoDB connection error:", error.message);
    console.error("Full error object:", error);
    process.exit(1);
  });

// Routes
// Root endpoint for Railway health check
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to Mesh API",
    version: "1.0.0",
    status: "running",
  });
});
// Add the test endpoint at /connection
app.get("/connection", (req, res) => {
  res.json({
    message: "Welcome to Mesh API",
    version: "1.0.0",
    status: "running",
  });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoutes);

// Socket.IO connection and join logic
io.on("connection", (socket) => {
  console.log("[Socket.IO] New client connected:", socket.id);
  socket.on("join", (userId) => {
    if (userId) {
      socket.join(userId);
      console.log(
        `[Socket.IO] Socket ${socket.id} joined room for user: ${userId}`
      );
    }
  });
  // Relay typing events to recipient room
  socket.on("typing", ({ senderId, recipientId }) => {
    if (!recipientId) return;
    console.log(`[Socket.IO] typing from ${senderId} -> ${recipientId}`);
    io.to(recipientId.toString()).emit("typing", { senderId, recipientId });
  });
  socket.on("disconnect", () => {
    console.log("[Socket.IO] Client disconnected:", socket.id);
  });
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Something went wrong!",
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Internal server error",
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Add process-level error handlers for debugging
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

console.log("About to start listening...");
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || "development"}`);
});

module.exports = { io };
