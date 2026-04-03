const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Post = require("../models/Post");
const Story = require("../models/Story");
const fetch = global.fetch || require("node-fetch");
const crypto = require("crypto");
const { sendMail, hasMailConfig } = require("../utils/mailer");

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

const createPasswordResetToken = () => crypto.randomBytes(32).toString("hex");
const hashPasswordResetToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

// @desc    List users excluding current user, with search & pagination (recently joined first)
// @route   GET /api/auth/users
// @access  Private
const getUsers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const query = (req.query.query || req.query.q || '').trim();

    const filters = { _id: { $ne: req.user._id } };
    if (query) {
      const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filters.$or = [{ username: regex }, { fullName: regex }];
    }

    const skip = (page - 1) * limit;
    const [total, users] = await Promise.all([
      User.countDocuments(filters),
      User.find(filters)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('username fullName avatar isVerified followers createdAt'),
    ]);

    const list = users.map((u) => ({
      _id: u._id,
      username: u.username,
      fullName: u.fullName,
      avatar: u.avatar,
      isVerified: !!u.isVerified,
      followerCount: Array.isArray(u.followers) ? u.followers.length : 0,
      createdAt: u.createdAt,
    }));

    const totalPages = Math.ceil(total / limit) || 1;
    const hasMore = page < totalPages;
    return res.json({ users: list, page, totalPages, total, hasMore });
  } catch (error) {
    console.error('Get users list error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

// @desc    Global search across users, posts, and stories
// @route   GET /api/auth/search
// @access  Private
const searchAll = async (req, res) => {
  try {
    const query = String(req.query.query || req.query.q || "").trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 8, 20);

    if (!query) {
      return res.json({ users: [], posts: [], stories: [], query: "" });
    }

    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    const matchingUsers = await User.find({
      _id: { $ne: req.user._id },
      $or: [{ username: regex }, { fullName: regex }, { bio: regex }],
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("username fullName avatar isVerified followers bio createdAt");

    const matchingUserIds = matchingUsers.map((user) => user._id);

    const [posts, stories] = await Promise.all([
      Post.find({
        $or: [{ content: regex }, { user: { $in: matchingUserIds } }],
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate({
          path: "user",
          select: "username fullName avatar isVerified",
          options: { strictPopulate: false },
        }),

      Story.find({
        expiresAt: { $gt: new Date() },
        $or: [{ caption: regex }, { user: { $in: matchingUserIds } }],
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate("user", "username fullName avatar isVerified"),
    ]);

    const userResults = matchingUsers.map((u) => ({
      _id: u._id,
      username: u.username,
      fullName: u.fullName,
      avatar: u.avatar,
      isVerified: !!u.isVerified,
      bio: u.bio || "",
      followerCount: Array.isArray(u.followers) ? u.followers.length : 0,
      createdAt: u.createdAt,
    }));

    const postResults = posts
      .filter((post) => post.user)
      .map((post) => ({
        _id: post._id,
        content: post.content,
        image: post.image,
        createdAt: post.createdAt,
        likesCount: Array.isArray(post.likes) ? post.likes.length : 0,
        commentsCount: Array.isArray(post.comments) ? post.comments.length : 0,
        user: {
          _id: post.user._id,
          username: post.user.username,
          fullName: post.user.fullName,
          avatar: post.user.avatar,
          isVerified: !!post.user.isVerified,
        },
      }));

    const storyResults = stories
      .filter((story) => story.user)
      .map((story) => ({
        _id: story._id,
        caption: story.caption || "",
        mediaUrl: story.mediaUrl,
        mediaType: story.mediaType,
        createdAt: story.createdAt,
        expiresAt: story.expiresAt,
        user: {
          _id: story.user._id,
          username: story.user.username,
          fullName: story.user.fullName,
          avatar: story.user.avatar,
          isVerified: !!story.user.isVerified,
        },
      }));

    return res.json({
      query,
      users: userResults,
      posts: postResults,
      stories: storyResults,
    });
  } catch (error) {
    console.error("Global search error:", error);
    return res.status(500).json({ error: "Server error" });
  }
};

// @desc    Get user suggestions (random), excluding current user and those already followed
// @route   GET /api/auth/suggestions
// @access  Private
const getUserSuggestions = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 20);

    // Load current user to get following list
    const me = await User.findById(req.user._id).select('following');
    if (!me) return res.status(404).json({ error: 'User not found' });

    const excludeIds = [req.user._id, ...(me.following || [])];

    // Prefer $sample for randomness
    const pipeline = [
      { $match: { _id: { $nin: excludeIds } } },
      { $sample: { size: limit } },
      { $project: { username: 1, fullName: 1, avatar: 1, isVerified: 1, followers: 1 } },
    ];

    const docs = await User.aggregate(pipeline);

    const suggestions = docs.map((u) => ({
      _id: u._id,
      username: u.username,
      fullName: u.fullName,
      avatar: u.avatar,
      isVerified: !!u.isVerified,
      followerCount: Array.isArray(u.followers) ? u.followers.length : 0,
    }));

    return res.json({ suggestions, limit });
  } catch (error) {
    console.error('Get user suggestions error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

// @desc    Get followers list by username
// @route   GET /api/auth/profile/:username/followers
// @access  Public
const getFollowersList = async (req, res) => {
  try {
    const { username } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;

    const user = await User.findOne({ username })
      .populate({ path: "followers", select: "username fullName avatar bio" })
      .select("followers");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const total = user.followers.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const items = user.followers.slice(start, end);

    res.json({
      total,
      page,
      limit,
      followers: items.map((u) => ({
        _id: u._id,
        username: u.username,
        fullName: u.fullName,
        avatar: u.avatar,
        bio: u.bio || "",
      })),
    });
  } catch (error) {
    console.error("Get followers list error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// @desc    Get following list by username
// @route   GET /api/auth/profile/:username/following
// @access  Public
const getFollowingList = async (req, res) => {
  try {
    const { username } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;

    const user = await User.findOne({ username })
      .populate({ path: "following", select: "username fullName avatar bio" })
      .select("following");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const total = user.following.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const items = user.following.slice(start, end);

    res.json({
      total,
      page,
      limit,
      following: items.map((u) => ({
        _id: u._id,
        username: u.username,
        fullName: u.fullName,
        avatar: u.avatar,
        bio: u.bio || "",
      })),
    });
  } catch (error) {
    console.error("Get following list error:", error);
    res.status(500).json({ error: "Server error" });
  }
};
// Helper: generate a unique username from a base (e.g., first name)
const generateUniqueUsername = async (base) => {
  const clean = (base || "user")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 20) || "user";

  // Try the clean base, then add numbers until unique
  let candidate = clean;
  let suffix = 0;
  // Limit attempts to avoid infinite loops
  while (suffix < 1000) {
    const exists = await User.findOne({ username: candidate }).select("_id");
    if (!exists) return candidate;
    suffix += 1;
    candidate = `${clean}${suffix}`;
  }
  // Fallback to random
  return `${clean}${Math.floor(Math.random() * 100000)}`;
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const { username, email, password, fullName } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      return res.status(400).json({
        error: "User already exists with this email or username",
      });
    }

    // Create new user
    const user = new User({
      username,
      email,
      password,
      fullName,
    });

    
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: user.getPublicProfile(),
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({
      error: "Server error during registration",
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email or username
    const user = await User.findOne({
      $or: [
        { email: email },
        { username: email } // Using 'email' field for both email and username input
      ]
    });
    if (!user) {
      return res.status(401).json({
        error: "Invalid credentials",
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: "Invalid credentials",
      });
    }

    // Update last active
    user.lastActive = new Date();
    user.isOnline = true;
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.json({
      message: "Login successful",
      token,
      user: user.getPublicProfile(),
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      error: "Server error during login",
    });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate("followers", "username fullName avatar")
      .select("-password");

    // Add follower count to the user object and convert following to array of IDs
    const userWithFollowers = user.getPublicProfile();
    userWithFollowers.followerCount = user.followers.length;
    userWithFollowers.followingCount = Array.isArray(user.following)
      ? user.following.length
      : 0;
    // Convert following array to just IDs for frontend compatibility
    userWithFollowers.following = user.following.map(id => id.toString());

    res.json({
      user: userWithFollowers,
    });
  } catch (error) {
    console.error("Get me error:", error);
    res.status(500).json({
      error: "Server error",
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const {
      username,
      fullName,
      bio,
      website,
      location,
      avatar,
      cover,
      birthday,
      gender,
      relationshipStatus,
      workplace,
      education,
      hometown,
      currentCity,
      phone,
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    if (username !== undefined) {
      const normalized = String(username).trim().toLowerCase();
      if (!normalized) {
        return res.status(400).json({ error: "Username is required" });
      }
      const usernameRegex = /^[a-z0-9._]{3,30}$/;
      if (!usernameRegex.test(normalized)) {
        return res.status(400).json({
          error:
            "Username must be 3-30 characters and use letters, numbers, dots, or underscores",
        });
      }
      if (normalized !== user.username) {
        const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const existing = await User.findOne({
          username: new RegExp(`^${escaped}$`, "i"),
        });
        if (existing && existing._id.toString() !== user._id.toString()) {
          return res.status(400).json({ error: "Username is already taken" });
        }
        user.username = normalized;
      }
    }

    // Update fields
    if (fullName) user.fullName = fullName;
    if (bio !== undefined) user.bio = bio;
    if (website !== undefined) user.website = website;
    if (location !== undefined) user.location = location;
    if (avatar !== undefined) user.avatar = avatar;
    if (cover !== undefined) user.cover = cover;
    if (birthday !== undefined) user.birthday = birthday ? new Date(birthday) : null;
    if (gender !== undefined) user.gender = gender;
    if (relationshipStatus !== undefined) user.relationshipStatus = relationshipStatus;
    if (workplace !== undefined) user.workplace = workplace;
    if (education !== undefined) user.education = education;
    if (hometown !== undefined) user.hometown = hometown;
    if (currentCity !== undefined) user.currentCity = currentCity;
    if (phone !== undefined) user.phone = phone;

    await user.save();

    res.json({
      message: "Profile updated successfully",
      user: user.getPublicProfile(),
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      error: "Server error during profile update",
    });
  }
};

// @desc    Check if a username is available
// @route   GET /api/auth/username-available?username=...
// @access  Private
const checkUsernameAvailability = async (req, res) => {
  try {
    const raw = String(req.query.username || "").trim().toLowerCase();
    if (!raw) {
      return res.status(400).json({ error: "Username is required" });
    }
    const usernameRegex = /^[a-z0-9._]{3,30}$/;
    if (!usernameRegex.test(raw)) {
      return res.status(400).json({
        error:
          "Username must be 3-30 characters and use letters, numbers, dots, or underscores",
      });
    }

    const current = await User.findById(req.user._id).select("username");
    if (current && current.username === raw) {
      return res.json({ available: true, reason: "current" });
    }

    const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const existing = await User.findOne({
      username: new RegExp(`^${escaped}$`, "i"),
    }).select("_id");

    return res.json({ available: !existing });
  } catch (error) {
    console.error("Username availability error:", error);
    return res.status(500).json({ error: "Server error" });
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
const logout = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (user) {
      user.isOnline = false;
      user.lastActive = new Date();
      await user.save();
    }

    res.json({
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      error: "Server error during logout",
    });
  }
};

// @desc    Request password reset email
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const user = await User.findOne({ email }).select(
      "+resetPasswordToken +resetPasswordExpires"
    );

    const successMessage =
      "If an account exists for that email, a reset link has been sent.";

    if (!user || user.provider) {
      return res.json({ message: successMessage });
    }

    const rawToken = createPasswordResetToken();
    const hashedToken = hashPasswordResetToken(rawToken);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = expiresAt;
    await user.save();

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(
      rawToken
    )}`;

    const subject = "Reset your Mesh password";
    const text = [
      `Hello ${user.fullName || user.username},`,
      "",
      "We received a request to reset your Mesh password.",
      `Reset it here: ${resetUrl}`,
      "",
      "This link will expire in 30 minutes.",
      "If you did not request this, you can ignore this email.",
    ].join("\n");

    const html = `
      <p>Hello ${user.fullName || user.username},</p>
      <p>We received a request to reset your Mesh password.</p>
      <p><a href="${resetUrl}">Reset your password</a></p>
      <p>This link will expire in 30 minutes.</p>
      <p>If you did not request this, you can ignore this email.</p>
    `;

    await sendMail({
      to: user.email,
      subject,
      text,
      html,
    });

    if (!hasMailConfig()) {
      console.warn("[auth] Password reset email skipped; use this URL:", resetUrl);
    }

    return res.json({ message: successMessage });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ error: "Server error during password reset request" });
  }
};

// @desc    Reset password using token
// @route   POST /api/auth/reset-password/:token
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const token = String(req.params?.token || "").trim();
    const password = String(req.body?.password || "");

    if (!token) {
      return res.status(400).json({ error: "Reset token is required" });
    }
    if (!password || password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters long" });
    }

    const hashedToken = hashPasswordResetToken(token);
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    }).select("+resetPasswordToken +resetPasswordExpires");

    if (!user) {
      return res.status(400).json({ error: "Reset link is invalid or has expired" });
    }

    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    return res.json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ error: "Server error during password reset" });
  }
};

// @desc    Get user profile by username
// @route   GET /api/auth/profile/:username
// @access  Public
const getUserProfile = async (req, res) => {
  try {
    const { username } = req.params;

    const user = await User.findOne({ username })
      .populate("followers", "username fullName avatar")
      .select("-password -email");

    if (!user) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    // Check if the requesting user is following this user
    let isFollowing = false;
    if (req.user) {
      isFollowing = user.followers.some(
        (follower) => follower._id.toString() === req.user._id.toString()
      );
    }

    // Add follower count to the user object and convert following to array of IDs
    const userWithFollowers = user.getPublicProfile();
    userWithFollowers.followerCount = user.followers.length;
    // Convert following array to just IDs for frontend compatibility
    userWithFollowers.following = user.following.map(id => id.toString());

    res.json({
      user: userWithFollowers,
      isFollowing,
    });
  } catch (error) {
    console.error("Get user profile error:", error);
    res.status(500).json({
      error: "Server error",
    });
  }
};

// @desc    Follow/Unfollow user
// @route   POST /api/auth/follow/:userId
// @access  Private
const followUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    if (currentUserId.toString() === userId) {
      return res.status(400).json({
        error: "You cannot follow yourself",
      });
    }

    const userToFollow = await User.findById(userId);
    const currentUser = await User.findById(currentUserId);

    if (!userToFollow || !currentUser) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    const isFollowing = currentUser.following.includes(userId);

    if (isFollowing) {
      // Unfollow
      currentUser.following = currentUser.following.filter(
        (id) => id.toString() !== userId
      );
      userToFollow.followers = userToFollow.followers.filter(
        (id) => id.toString() !== currentUserId.toString()
      );
    } else {
      // Follow
      currentUser.following.push(userId);
      userToFollow.followers.push(currentUserId);
    }

    await Promise.all([currentUser.save(), userToFollow.save()]);

    res.json({
      message: isFollowing
        ? "Unfollowed successfully"
        : "Followed successfully",
      isFollowing: !isFollowing,
    });
  } catch (error) {
    console.error("Follow/Unfollow error:", error);
    res.status(500).json({
      error: "Server error",
    });
  }
};

module.exports = {
  register,
  login,
  getMe,
  getUserSuggestions,
  getUsers,
  searchAll,
  forgotPassword,
  resetPassword,
  updateProfile,
  checkUsernameAvailability,
  logout,
  getUserProfile,
  followUser,
  getFollowersList,
  getFollowingList,
  // OAuth handlers will be appended by further export below
};

// ===== OAuth: Google =====
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

const oauthGoogleStart = async (req, res) => {
  try {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      redirect_uri:
        process.env.GOOGLE_REDIRECT_URI || `${process.env.BACKEND_URL}/api/auth/oauth/google/callback`,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
    });
    return res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
  } catch (err) {
    console.error("Google OAuth start error:", err);
    return res.status(500).json({ error: "Failed to initiate Google OAuth" });
  }
};

const oauthGoogleCallback = async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: "Missing code" });

    const body = new URLSearchParams({
      code: String(code),
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri:
        process.env.GOOGLE_REDIRECT_URI || `${process.env.BACKEND_URL}/api/auth/oauth/google/callback`,
      grant_type: "authorization_code",
    });

    const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const tokenJson = await tokenResp.json();
    if (!tokenResp.ok) {
      console.error("Google token exchange failed:", tokenJson);
      return res.status(400).json({ error: "Google token exchange failed" });
    }

    const idToken = tokenJson.id_token;
    if (!idToken) return res.status(400).json({ error: "Missing id_token" });

    // Decode the id_token (JWT) to get profile info
    const decoded = JSON.parse(Buffer.from(idToken.split(".")[1], "base64").toString());
    const sub = decoded.sub;
    const email = decoded.email;
    const name = decoded.name || decoded.given_name || "User";
    const picture = decoded.picture || "";

    if (!email) {
      return res.status(400).json({ error: "Google account email not available" });
    }

    // Find or create user
    let user = await User.findOne({ $or: [{ provider: "google", providerId: sub }, { email }] });
    if (!user) {
      const firstName = (decoded.given_name || name || "User").split(" ")[0];
      const username = await generateUniqueUsername(firstName);
      user = new User({
        username,
        email,
        fullName: name,
        avatar: picture || "",
        provider: "google",
        providerId: sub,
        isVerified: true,
        // No password for OAuth accounts
      });
      await user.save();
    } else {
      // Ensure provider fields are set for existing user
      if (!user.provider) user.provider = "google";
      if (!user.providerId) user.providerId = sub;
      // Keep profile fresh
      if (picture && user.avatar !== picture) user.avatar = picture;
      if (name && user.fullName !== name) user.fullName = name;
      await user.save();
    }

    const appToken = generateToken(user._id);
    const frontend = process.env.FRONTEND_URL || "http://localhost:5173";
    // Redirect to frontend callback with token
    return res.redirect(`${frontend}/oauth/callback?token=${encodeURIComponent(appToken)}`);
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return res.status(500).json({ error: "Google OAuth callback failed" });
  }
};

// ===== OAuth: GitHub =====
const GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";

const oauthGithubStart = async (req, res) => {
  try {
    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID || "",
      redirect_uri:
        process.env.GITHUB_REDIRECT_URI || `${process.env.BACKEND_URL}/api/auth/oauth/github/callback`,
      scope: "read:user user:email",
      allow_signup: "true",
    });
    return res.redirect(`${GITHUB_AUTH_URL}?${params.toString()}`);
  } catch (err) {
    console.error("GitHub OAuth start error:", err);
    return res.status(500).json({ error: "Failed to initiate GitHub OAuth" });
  }
};

const oauthGithubCallback = async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: "Missing code" });

    const tokenParams = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID || "",
      client_secret: process.env.GITHUB_CLIENT_SECRET || "",
      code: String(code),
      redirect_uri:
        process.env.GITHUB_REDIRECT_URI || `${process.env.BACKEND_URL}/api/auth/oauth/github/callback`,
    });

    const tokenResp = await fetch(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: tokenParams,
    });
    const tokenJson = await tokenResp.json();
    if (!tokenResp.ok || tokenJson.error) {
      console.error("GitHub token exchange failed:", tokenJson);
      return res.status(400).json({ error: "GitHub token exchange failed" });
    }
    const accessToken = tokenJson.access_token;

    // Get user profile
    const userResp = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    const ghUser = await userResp.json();
    if (!userResp.ok) {
      console.error("GitHub user fetch failed:", ghUser);
      return res.status(400).json({ error: "Failed to fetch GitHub user" });
    }

    // Get emails to find primary email
    let email = null;
    try {
      const emailResp = await fetch("https://api.github.com/user/emails", {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });
      const emails = await emailResp.json();
      if (Array.isArray(emails)) {
        const primary = emails.find((e) => e.primary) || emails.find((e) => e.verified) || emails[0];
        email = primary && primary.email;
      }
    } catch (e) {
      console.warn("GitHub emails fetch failed, proceeding without email");
    }

    const providerId = String(ghUser.id);
    const name = ghUser.name || ghUser.login || "GitHub User";
    const avatar = ghUser.avatar_url || "";
    const loginName = ghUser.login || name.split(" ")[0];
    if (!email) {
      // Fallback email to satisfy model validation
      email = `${loginName}@users.noreply.github.com`;
    }

    // Find or create user
    let user = await User.findOne({ $or: [{ provider: "github", providerId }, { email }] });
    if (!user) {
      const base = (name || loginName).split(" ")[0];
      const username = await generateUniqueUsername(base);
      user = new User({
        username,
        email,
        fullName: name,
        avatar,
        provider: "github",
        providerId,
        isVerified: true,
      });
      await user.save();
    } else {
      if (!user.provider) user.provider = "github";
      if (!user.providerId) user.providerId = providerId;
      if (avatar && user.avatar !== avatar) user.avatar = avatar;
      if (name && user.fullName !== name) user.fullName = name;
      await user.save();
    }

    const appToken = generateToken(user._id);
    const frontend = process.env.FRONTEND_URL || "http://localhost:5173";
    return res.redirect(`${frontend}/oauth/callback?token=${encodeURIComponent(appToken)}`);
  } catch (err) {
    console.error("GitHub OAuth callback error:", err);
    return res.status(500).json({ error: "GitHub OAuth callback failed" });
  }
};

// Re-export with OAuth handlers
module.exports.oauthGoogleStart = oauthGoogleStart;
module.exports.oauthGoogleCallback = oauthGoogleCallback;
module.exports.oauthGithubStart = oauthGithubStart;
module.exports.oauthGithubCallback = oauthGithubCallback;
