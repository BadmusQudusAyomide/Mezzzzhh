const express = require("express");
const router = express.Router();
const { auth } = require("../middleware/auth");
const {
  register,
  login,
  getMe,
  updateProfile,
  logout,
  getUserProfile,
  followUser,
} = require("../controllers/authController");

// Public routes
router.post("/register", register);
router.post("/login", login);

// Protected routes
router.get("/me", auth, getMe);
router.put("/profile", auth, updateProfile);
router.post("/logout", auth, logout);

// Profile routes
router.get("/profile/:username", getUserProfile); // Public route
router.post("/follow/:userId", auth, followUser); // Protected route

module.exports = router;
 