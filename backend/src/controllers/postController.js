const Post = require("../models/Post");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { sendPushToUser } = require("../utils/pushSender");

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

// @desc    Get all posts (paginated)
// @route   GET /api/posts
// @access  Public
const getPosts = async (req, res) => {
  try {
    const page = parseInt(req.query.page || 1);
    const limit = parseInt(req.query.limit || 10);
    const skip = (page - 1) * limit;

   
    const totalPosts = await Post.countDocuments();
    const totalPages = Math.ceil(totalPosts / limit) || 1;
    const hasMore = page < totalPages;

    const posts = await Post.find()
      .populate({
        path: "user",
        select: "fullName username avatar isVerified",
        options: { strictPopulate: false },
      })
      .populate({
        path: "comments.user",
        select: "_id fullName username avatar isVerified",
        options: { strictPopulate: false },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Filter out posts with missing user (null after population)
    const filteredPosts = posts
      .filter((post) => post.user)
      .map((post) => {
        const obj = post.toObject();
        obj.likes = Array.isArray(obj.likes) ? obj.likes : [];
        obj.comments = Array.isArray(obj.comments) ? obj.comments : [];
        // Add userId field (original post.user ObjectId)
        obj.userId = post.user && post.user._id ? post.user._id : post.user;
        return obj;
      });

    res.json({
      posts: filteredPosts,
      pagination: {
        currentPage: page,
        totalPages,
        totalPosts,
        hasMore,
        limit,
      },
    });
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
    const { page = 1, limit = 10 } = req.query;
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Convert page and limit to numbers
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get total count for pagination metadata
    const totalPosts = await Post.countDocuments({ user: user._id });
    const totalPages = Math.ceil(totalPosts / limitNum);
    const hasMore = pageNum < totalPages;

    const posts = await Post.find({ user: user._id })
      .populate({
        path: "user",
        select: "fullName username avatar isVerified",
        options: { strictPopulate: false },
      })
      .populate({
        path: "comments.user",
        select: "_id fullName username avatar isVerified",
        options: { strictPopulate: false },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Add userId to each post
    const postsWithUserId = posts.map((post) => {
      const obj = post.toObject();
      obj.userId = post.user && post.user._id ? post.user._id : post.user;
      return obj;
    });

    // Return posts with pagination metadata
    res.json({ 
      posts: postsWithUserId,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalPosts,
        hasMore,
        limit: limitNum
      }
    });
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
      // Also send Web Push for LIKE
      sendPushToUser(post.user._id, {
        title: "New like",
        body: `${req.user.fullName} liked your post`,
        url: `/posts/${post._id}`,
        tag: "mesh-like",
      });
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
      // Also send Web Push for COMMENT
      sendPushToUser(post.user._id, {
        title: "New comment",
        body: `${req.user.fullName} commented on your post`,
        url: `/posts/${post._id}`,
        tag: "mesh-comment",
      });
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

// @desc    Delete a post (owner only)
// @route   DELETE /api/posts/:postId
// @access  Private
const deletePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: "Post not found" });
    if (post.user.toString() !== userId.toString()) {
      return res.status(403).json({ error: "Not authorized to delete this post" });
    }
    await Post.deleteOne({ _id: postId });
    // Remove from user's posts array if stored
    await User.findByIdAndUpdate(userId, { $pull: { posts: postId } }).catch(() => {});
    // Emit real-time deletion
    const io = req.app.get("io");
    if (io) io.emit("postDeleted", { postId });
    return res.json({ message: "Post deleted" });
  } catch (error) {
    console.error("Delete post error:", error);
    return res.status(500).json({ error: "Server error while deleting post" });
  }
};

module.exports.deletePost = deletePost;
