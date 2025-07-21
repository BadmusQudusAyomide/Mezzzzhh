const Post = require("../models/Post");
const User = require("../models/User");
const Notification = require("../models/Notification");

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

// @desc    Get all posts by username
// @route   GET /api/posts/user/:username
// @access  Public
const getPostsByUsername = async (req, res) => {
  try {
    const { username } = req.params;
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const posts = await Post.find({ user: user._id })
      .populate({
        path: "user",
        select: "fullName username avatar isVerified",
        options: { strictPopulate: false },
      })
      .sort({ createdAt: -1 });
    res.json({ posts });
  } catch (error) {
    console.error("Get posts by username error:", error.message, error.stack);
    res.status(500).json({
      error: "Server error while fetching user's posts",
      details: error.message,
    });
  }
};

// @desc    Like or unlike a post
// @route   POST /api/posts/:postId/like
// @access  Private
const likePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;
    let post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: "Post not found" });
    const liked = post.likes.includes(userId);
    if (liked) {
      post.likes.pull(userId);
    } else {
      post.likes.push(userId);
    }
    await post.save();
    post = await Post.findById(postId)
      .populate({
        path: "user",
        select: "fullName username avatar isVerified",
        options: { strictPopulate: false },
      })
      .populate({
        path: "comments.user",
        select: "_id fullName username avatar isVerified",
        options: { strictPopulate: false },
      });
    // Emit real-time update
    const io = req.app.get("io");
    io.emit("postUpdated", post);
    // Create notification for post owner (if not self)
    if (post.user && post.user._id.toString() !== userId.toString() && !liked) {
      const notification = await Notification.create({
        user: post.user._id,
        type: "like",
        from: userId,
        post: post._id,
        text: `${req.user.fullName} liked your post`,
      });
      console.log(
        "[Socket.IO] Emitting LIKE notification to user:",
        post.user._id.toString(),
        notification
      );
      
      io.to(post.user._id.toString()).emit("notification", notification);
    }
    res.json({
      liked: !liked,
      likesCount: post.likes.length,
      post,
    });
  } catch (error) {
    console.error("Like post error:", error);
    res.status(500).json({ error: "Server error while liking post" });
  }
};

// @desc    Add a comment to a post
// @route   POST /api/posts/:postId/comments
// @access  Private
const addComment = async (req, res) => {
  try {
    const { postId } = req.params;
    const { text } = req.body;
    if (!text || text.trim() === "") {
      return res.status(400).json({ error: "Comment text is required" });
    }
    let post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: "Post not found" });
    const comment = {
      user: req.user._id,
      text,
      createdAt: new Date(),
    };
    post.comments.push(comment);
    await post.save();
    post = await Post.findById(postId)
      .populate({
        path: "user",
        select: "fullName username avatar isVerified",
        options: { strictPopulate: false },
      })
      .populate({
        path: "comments.user",
        select: "_id fullName username avatar isVerified",
        options: { strictPopulate: false },
      });
    // Emit real-time update
    const io = req.app.get("io");
    io.emit("postUpdated", post);
    // Create notification for post owner (if not self)
    if (post.user && post.user._id.toString() !== req.user._id.toString()) {
      const notification = await Notification.create({
        user: post.user._id,
        type: "comment",
        from: req.user._id,
        post: post._id,
        text: `${req.user.fullName} commented: "${text}"`,
      });
      console.log(
        "[Socket.IO] Emitting COMMENT notification to user:",
        post.user._id.toString(),
        notification
      );
      io.to(post.user._id.toString()).emit("notification", notification);
    }
    res.status(201).json({
      comment: post.comments[post.comments.length - 1],
      post,
    });
  } catch (error) {
    console.error("Add comment error:", error);
    res.status(500).json({ error: "Server error while adding comment" });
  }
};

module.exports = {
  createPost,
  getPosts,
  getPostsByUsername,
  likePost,
  addComment,
};
