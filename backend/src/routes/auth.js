const express = require("express");
const router = express.Router();
const { auth } = require("../middleware/auth");
const {
  register,
  login,
  getMe,
  getUserSuggestions,
  getUsers,
  searchAll,
  checkUsernameAvailability,
  forgotPassword,
  resetPassword,
  updateProfile,
  logout,
  getUserProfile,
  followUser,
  getFollowersList,
  getFollowingList,
  oauthGoogleStart,
  oauthGoogleCallback,
  oauthGithubStart,
  oauthGithubCallback,
} = require("../controllers/authController");

// Public routes
router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);


// Protected routes
router.get("/me", auth, getMe);
router.put("/profile", auth, updateProfile);
router.post("/logout", auth, logout);
router.get("/username-available", auth, checkUsernameAvailability);
router.get("/suggestions", auth, getUserSuggestions);
router.get("/users", auth, getUsers);
router.get("/search", auth, searchAll);

// Profile routes
router.get("/profile/:username", getUserProfile); // Public route
router.post("/follow/:userId", auth, followUser); // Protected route

// OAuth routes
router.get("/profile/:username/followers", getFollowersList); // Public list
router.get("/profile/:username/following", getFollowingList); // Public list
router.get("/oauth/google", oauthGoogleStart);
router.get("/oauth/google/callback", oauthGoogleCallback);
router.get("/oauth/github", oauthGithubStart);
router.get("/oauth/github/callback", oauthGithubCallback);

module.exports = router;
 
