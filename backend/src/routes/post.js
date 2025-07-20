const express = require("express");
const router = express.Router();
const { auth } = require("../middleware/auth");
const { createPost, getPosts } = require("../controllers/postController");

// Create a new post
router.post("/", auth, createPost);
// Get all posts
router.get("/", getPosts);

module.exports = router;
