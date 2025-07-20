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

module.exports = router;
