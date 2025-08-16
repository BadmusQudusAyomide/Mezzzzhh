const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: false,
      default: '',
      maxlength: 1000,
    },
    messageType: {
      type: String,
      enum: ["text", "image", "file", "audio", "video"],
      default: "text",
    },
    // For audio messages
    audioUrl: { type: String, default: null },
    audioDuration: { type: Number, default: null },
    // For image messages
    imageUrl: { type: String, default: null },
    // For video messages
    videoUrl: { type: String, default: null },
    videoPoster: { type: String, default: null },
    videoDuration: { type: Number, default: null },
    // Thread root id. For a root message, threadId can be the same as _id.
    // For replies, threadId points to the root message _id.
    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
      index: true,
    },
    // Reference to a parent message when replying
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    // Reactions on this message
    reactions: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        emoji: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
    edited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
    },
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index for better query performance
messageSchema.index({ sender: 1, recipient: 1, createdAt: -1 });
messageSchema.index({ recipient: 1, isRead: 1 });
messageSchema.index({ replyTo: 1 });
messageSchema.index({ threadId: 1, createdAt: -1 });

module.exports = mongoose.model("Message", messageSchema);
