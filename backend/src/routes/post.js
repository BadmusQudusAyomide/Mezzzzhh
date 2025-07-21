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

// Get notifications for the current user
router.get("/notifications", auth, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate("from", "fullName avatar username")
      .populate("post", "content image");
    res.json({ notifications });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

module.exports = router;
