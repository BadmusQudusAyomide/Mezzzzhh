const express = require("express");
const router = express.Router();
const { auth } = require("../middleware/auth");
const {
  createPost,
  getPosts,
  getPostsByUsername,
  likePost,
  addComment,
} = require("../controllers/postController");
const Notification = require("../models/Notification");


// Create a new post
router.post("/", auth, createPost);
// Get all posts
router.get("/", getPosts);
// Get all posts by a specific user
router.get("/user/:username", getPostsByUsername);
// Like/unlike a post
router.post("/:postId/like", auth, likePost);
// Add a comment to a post
router.post("/:postId/comments", auth, addComment);

// Get notifications for the current user with pagination
router.get("/notifications", auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

    // Get total count for pagination info
    const totalNotifications = await Notification.countDocuments({ user: req.user._id });
    
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("from", "fullName avatar username")
      .populate("post", "content image");

    // Calculate pagination info
    const totalPages = Math.ceil(totalNotifications / limit);
    const hasMore = page < totalPages;

    res.json({ 
      notifications,
      pagination: {
        currentPage: page,
        totalPages,
        totalNotifications,
        hasMore,
        limit
      }
    });
  } catch (error) {
    console.error("Failed to fetch notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

module.exports = router;
