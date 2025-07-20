const Post = require("../models/Post");
const User = require("../models/User");

// @desc    Create a new post
// @route   POST /api/posts
// @access  Private
const createPost = async (req, res) => {
  try {
    const { content, image } = req.body;
    if (!content || content.trim() === "") {
      return res.status(400).json({ error: "Content is required" });
    }
    const post = new Post({
      user: req.user._id,
      content,
      image,
    });
    await post.save();
    // Add post to user's posts array
    await User.findByIdAndUpdate(req.user._id, { $push: { posts: post._id } });
    res.status(201).json({ message: "Post created successfully", post });
  } catch (error) {
    console.error("Create post error:", error);
    res.status(500).json({ error: "Server error while creating post" });
  }
};

// @desc    Get all posts
// @route   GET /api/posts
// @access  Public
const getPosts = async (req, res) => {
  try {
    const posts = await Post.find()
      .populate("user", "fullName username avatar isVerified")
      .sort({ createdAt: -1 });
    res.json({ posts });
  } catch (error) {
    console.error("Get posts error:", error);
    res.status(500).json({ error: "Server error while fetching posts" });
  }
};

module.exports = { createPost, getPosts };
