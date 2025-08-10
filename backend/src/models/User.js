const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters long"],
      maxlength: [30, "Username cannot exceed 30 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email",
      ],
    },
    password: {
      type: String,
      // Password required only for local accounts (no OAuth provider)
      required: function () {
        return !this.provider;
      },
      minlength: [6, "Password must be at least 6 characters long"],
    },
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      maxlength: [50, "Full name cannot exceed 50 characters"],
    },
    avatar: {
      type: String,
      default: "",
    },
    cover: {
      type: String,
      default:
        "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1200&h=400&fit=crop",
    },
    bio: {
      type: String,
      maxlength: [200, "Bio cannot exceed 200 characters"],
      default: "",
    },
    website: {
      type: String,
      default: "",
    },
    location: {
      type: String,
      default: "",
    },
    // Extended profile fields
    birthday: {
      type: Date,
      default: null,
    },
    gender: {
      type: String,
      enum: [
        "male",
        "female",
        "other",
        "prefer_not_to_say",
        "",
      ],
      default: "",
    },
    relationshipStatus: {
      type: String,
      enum: [
        "single",
        "in_a_relationship",
        "engaged",
        "married",
        "complicated",
        "separated",
        "divorced",
        "widowed",
        "",
      ],
      default: "",
    },
    workplace: {
      type: String,
      default: "",
    },
    education: {
      type: String,
      default: "",
    },
    hometown: {
      type: String,
      default: "",
    },
    currentCity: {
      type: String,
      default: "",
    },
    phone: {
      type: String,
      default: "",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    followers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    following: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    posts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Post",
      },
    ],
    savedPosts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Post",
      },
    ],
    notifications: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Notification",
      },
    ],
    lastActive: {
      type: Date,
      default: Date.now,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    // OAuth fields
    provider: {
      type: String, // 'google' | 'github' | undefined
      default: undefined,
    },
    providerId: {
      type: String,
      default: undefined,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for follower count
userSchema.virtual("followerCount").get(function () {
  return Array.isArray(this.followers) ? this.followers.length : 0;
});

// Virtual for following count
userSchema.virtual("followingCount").get(function () {
  return Array.isArray(this.following) ? this.following.length : 0;
});

// Virtual for post count
userSchema.virtual("postCount").get(function () {
  return Array.isArray(this.posts) ? this.posts.length : 0;
});

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to get public profile (without sensitive data)
userSchema.methods.getPublicProfile = function () {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.email;
  return userObject;
};

// Index for better query performance
userSchema.index({ createdAt: -1 });

module.exports = mongoose.model("User", userSchema);
