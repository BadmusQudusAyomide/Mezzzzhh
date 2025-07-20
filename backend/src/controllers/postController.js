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
      .populate({
        path: "user",
        select: "fullName username avatar isVerified",
        options: { strictPopulate: false },
      })
      .sort({ createdAt: -1 });
    // Filter out posts with missing user (null after population)
    const filteredPosts = posts
      .filter((post) => post.user)
      .map((post) => {
        const obj = post.toObject();
        obj.likes = Array.isArray(obj.likes) ? obj.likes : [];
        obj.comments = Array.isArray(obj.comments) ? obj.comments : [];
        return obj;
      });
    res.json({ posts: filteredPosts });
  } catch (error) {
    console.error("Get posts error:", error.message, error.stack);
    res.status(500).json({
      error: "Server error while fetching posts",
      details: error.message,
    });
  }
};

module.exports = { createPost, getPosts };
