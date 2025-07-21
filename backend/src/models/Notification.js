const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // recipient
    type: { type: String, enum: ["like", "comment"], required: true },
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // actor
    post: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true },
    text: { type: String },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model("Notification", notificationSchema); 