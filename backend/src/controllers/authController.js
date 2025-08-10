const jwt = require("jsonwebtoken");
const User = require("../models/User");
const fetch = global.fetch || require("node-fetch");

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
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
  updateProfile,
  logout,
  getUserProfile,
  followUser,
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
