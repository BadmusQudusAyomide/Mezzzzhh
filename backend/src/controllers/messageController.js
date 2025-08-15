const Message = require('../models/Message');
const User = require('../models/User');
const { sendPushToUser } = require('../utils/pushSender');
const multer = require('multer');
const { cloudinary } = require('../utils/cloudinary');

// @desc    Get conversations for current user with pagination
// @route   GET /api/messages/conversations
// @access  Private
const getConversations = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

    // Get all unique conversations for the user with pagination
    const conversationsAggregate = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender: userId },
            { recipient: userId }
          ]
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: {
            $cond: {
              if: { $eq: ["$sender", userId] },
              then: "$recipient",
              else: "$sender"
            }
          },
          lastMessage: { $first: "$$ROOT" },
          unreadCount: {
            $sum: {
              $cond: {
                if: {
                  $and: [
                    { $eq: ["$recipient", userId] },
                    { $eq: ["$isRead", false] }
                  ]
                },
                then: 1,
                else: 0
              }
            }
          }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user"
        }
      },
      {
        $unwind: "$user"
      },
      {
        $project: {
          _id: 1,
          user: {
            _id: "$user._id",
            username: "$user.username",
            fullName: "$user.fullName",
            avatar: "$user.avatar",
            isOnline: "$user.isOnline",
            lastActive: "$user.lastActive"
          },
          lastMessage: {
            _id: "$lastMessage._id",
            content: "$lastMessage.content",
            messageType: "$lastMessage.messageType",
            createdAt: "$lastMessage.createdAt",
            isRead: "$lastMessage.isRead",
            sender: "$lastMessage.sender"
          },
          unreadCount: 1
        }
      },
      {
        $sort: { "lastMessage.createdAt": -1 }
      }
    ]);

    // Get total count for pagination
    const totalConversations = conversationsAggregate.length;
    
    // Apply pagination
    const conversations = conversationsAggregate.slice(skip, skip + limit);

    // Calculate pagination info
    const totalPages = Math.ceil(totalConversations / limit);
    const hasMore = page < totalPages;

    res.json({ 
      conversations,
      pagination: {
        currentPage: page,
        totalPages,
        totalConversations,
        hasMore,
        limit
      }
    });
  } catch (error) {
    console.error("Get conversations error:", error);
    res.status(500).json({ error: "Server error while fetching conversations" });
  }
};

// @desc    Upload voice note and create audio message
// @route   POST /api/messages/voice
// @access  Private
const uploadVoiceNote = async (req, res) => {
  try {
    const senderId = req.user._id;
    const { recipientId, replyTo = null, duration } = req.body;
    const file = req.file;

    if (!recipientId) return res.status(400).json({ error: 'recipientId is required' });
    if (!file) return res.status(400).json({ error: 'audio file is required' });

    const recipient = await User.findById(recipientId);
    if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

    // Determine threadId from replyTo if provided
    let threadId = null;
    if (replyTo) {
      const parent = await Message.findById(replyTo);
      if (parent) threadId = parent.threadId ? parent.threadId : parent._id;
    }

    // Upload to Cloudinary from memory buffer via data URI (avoids extra deps)
    const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    const uploadResult = await cloudinary.uploader.upload(dataUri, {
      resource_type: 'video', // use 'video' for audio in Cloudinary
      folder: 'mesh/voice',
      format: 'mp3',
      audio_codec: 'mp3',
      bit_rate: '64k', // smaller for faster streaming
    });

    const message = new Message({
      sender: senderId,
      recipient: recipientId,
      content: '',
      messageType: 'audio',
      audioUrl: uploadResult.secure_url,
      audioDuration: duration ? Number(duration) : (uploadResult.duration || null),
      replyTo: replyTo || null,
      threadId,
    });
    await message.save();
    if (!replyTo && !message.threadId) {
      message.threadId = message._id;
      await message.save();
    }

    await message.populate('sender', 'username fullName avatar');
    await message.populate('recipient', 'username fullName avatar');
    if (message.replyTo) {
      await message.populate({
        path: 'replyTo',
        populate: [
          { path: 'sender', select: 'username fullName avatar' },
          { path: 'recipient', select: 'username fullName avatar' },
        ],
      });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(recipientId.toString()).emit('newMessage', message);
      io.to(senderId.toString()).emit('messageSent', message);
    }

    // Also push notification
    sendPushToUser(recipientId, {
      title: 'New voice note',
      body: `${req.user.fullName} sent a voice message`,
      url: `/inbox`,
      tag: 'mesh-message',
    });

    res.status(201).json({ message });
  } catch (error) {
    console.error('Upload voice note error:', error);
    res.status(500).json({ error: 'Server error while uploading voice note' });
  }
};

// @desc    Return total unread messages for current user
// @route   GET /api/messages/unread-count/total
// @access  Private
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;
    const count = await Message.countDocuments({ recipient: userId, isRead: false });
    res.json({ count });
  } catch (error) {
    console.error('Get unread messages count error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// @desc    Get messages between two users (supports search and date range)
// @route   GET /api/messages/:userId
// @access  Private
const getMessages = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const otherUserId = req.params.userId;

    // Pagination
    const { before, limit: limitQuery, q, start, end } = req.query;
    const limit = Math.max(1, Math.min(parseInt(limitQuery, 10) || 50, 100));
    const createdAtFilter = before ? { createdAt: { $lt: new Date(isNaN(Number(before)) ? before : Number(before)) } } : {};

    // Optional date range filter (inclusive). If end is provided without time, include end-of-day.
    const range = {};
    if (start) {
      const s = new Date(isNaN(Number(start)) ? start : Number(start));
      range.$gte = s;
    }
    if (end) {
      const e = new Date(isNaN(Number(end)) ? end : Number(end));
      // set to end of day if date-only
      if (!isNaN(e.getTime())) {
        e.setHours(23, 59, 59, 999);
        range.$lte = e;
      }
    }
    const rangeFilter = Object.keys(range).length ? { createdAt: range } : {};

    const baseCriteria = {
      $or: [
        { sender: currentUserId, recipient: otherUserId },
        { sender: otherUserId, recipient: currentUserId }
      ],
      ...createdAtFilter,
      ...rangeFilter,
    };

    // Optional text search across content and participant names
    let textCriteria = {};
    if (q && String(q).trim().length > 0) {
      const regex = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      textCriteria = { content: { $regex: regex } };
    }

    const messages = await Message.find({ ...baseCriteria, ...textCriteria })
    .populate('sender', 'username fullName avatar')
    .populate('recipient', 'username fullName avatar')
    .populate({
      path: 'replyTo',
      populate: [
        { path: 'sender', select: 'username fullName avatar' },
        { path: 'recipient', select: 'username fullName avatar' },
      ],
    })
    .sort({ createdAt: -1 })
    .limit(limit + 1); // fetch one extra to know if there's more

    // We fetched newest first; keep only latest `limit`, then reverse for ascending display
    const hasMore = messages.length > limit;
    const limited = hasMore ? messages.slice(0, limit) : messages;
    const orderedAsc = limited.slice().reverse();

    // Mark messages as read
    const unreadMessages = orderedAsc.filter(
      (msg) => msg.recipient.toString() === currentUserId.toString() && !msg.isRead
    );
    if (unreadMessages.length > 0) {
      await Message.updateMany(
        { _id: { $in: unreadMessages.map((m) => m._id) } },
        { $set: { isRead: true } }
      );
    }

    res.json({ messages: orderedAsc, hasMore });
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({ error: "Server error while fetching messages" });
  }
};

// @desc    Send a message
// @route   POST /api/messages
// @access  Private
const sendMessage = async (req, res) => {
  try {
    const { recipientId, content, messageType = 'text', replyTo = null } = req.body;
    const senderId = req.user._id;

    if (!recipientId || !content) {
      return res.status(400).json({ error: "Recipient and content are required" });
    }

    // Check if recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ error: "Recipient not found" });
    }

    // Determine threadId: for replies, inherit root threadId from parent or parent._id
    let threadId = null;
    if (replyTo) {
      const parent = await Message.findById(replyTo);
      if (parent) {
        threadId = parent.threadId ? parent.threadId : parent._id;
      }
    }

    const message = new Message({
      sender: senderId,
      recipient: recipientId,
      content,
      messageType,
      replyTo: replyTo || null,
      threadId: threadId,
    });

    await message.save();

    // If this is a root message (no replyTo), set its threadId to itself for easier thread fetch
    if (!replyTo && !message.threadId) {
      message.threadId = message._id;
      await message.save();
    }

    // Populate sender and recipient info
    await message.populate('sender', 'username fullName avatar');
    await message.populate('recipient', 'username fullName avatar');
    if (message.replyTo) {
      await message.populate({
        path: 'replyTo',
        populate: [
          { path: 'sender', select: 'username fullName avatar' },
          { path: 'recipient', select: 'username fullName avatar' },
        ],
      });
    }

    // Emit real-time message via Socket.IO
    const io = req.app.get('io');
    if (io) {
      // Send to recipient
      io.to(recipientId.toString()).emit('newMessage', message);
      // Send to sender for confirmation
      io.to(senderId.toString()).emit('messageSent', message);
    }

    // Also send Web Push to recipient
    sendPushToUser(recipientId, {
      title: 'New message',
      body: `${req.user.fullName} sent you a message`,
      url: `/inbox`,
      tag: 'mesh-message',
    });

    res.status(201).json({ message });
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ error: "Server error while sending message" });
  }
};

// @desc    Get messages in a thread (root + replies)
// @route   GET /api/messages/thread/:threadId
// @access  Private
const getThreadMessages = async (req, res) => {
  try {
    const { threadId } = req.params;
    const { before, limit: limitQuery } = req.query;
    const limit = Math.max(1, Math.min(parseInt(limitQuery, 10) || 50, 100));
    const createdAtFilter = before ? { createdAt: { $lt: new Date(isNaN(Number(before)) ? before : Number(before)) } } : {};

    const messages = await Message.find({ threadId, ...createdAtFilter })
      .populate('sender', 'username fullName avatar')
      .populate('recipient', 'username fullName avatar')
      .populate({
        path: 'replyTo',
        populate: [
          { path: 'sender', select: 'username fullName avatar' },
          { path: 'recipient', select: 'username fullName avatar' },
        ],
      })
      .sort({ createdAt: -1 })
      .limit(limit + 1);

    const hasMore = messages.length > limit;
    const limited = hasMore ? messages.slice(0, limit) : messages;
    const orderedAsc = limited.slice().reverse();

    res.json({ messages: orderedAsc, hasMore });
  } catch (error) {
    console.error('Get thread messages error:', error);
    res.status(500).json({ error: 'Server error while fetching thread messages' });
  }
};

// @desc    Edit a message (only by sender)
// @route   PUT /api/messages/:messageId
// @access  Private
const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.user._id;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const msg = await Message.findOne({ _id: messageId, sender: userId });
    if (!msg) {
      return res.status(404).json({ error: 'Message not found or not authorized' });
    }

    msg.content = content.trim();
    msg.edited = true;
    msg.editedAt = new Date();
    await msg.save();

    await msg.populate('sender', 'username fullName avatar');
    await msg.populate('recipient', 'username fullName avatar');

    const io = req.app.get('io');
    if (io) {
      io.to(msg.recipient.toString()).emit('messageEdited', msg);
      io.to(msg.sender.toString()).emit('messageEdited', msg);
    }

    res.json({ message: msg });
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({ error: 'Server error while editing message' });
  }
};

// @desc    Add or toggle a reaction on a message
// @route   POST /api/messages/:messageId/reactions
// @access  Private
const addReaction = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;
    if (!emoji) return res.status(400).json({ error: 'Emoji is required' });

    const msg = await Message.findById(messageId);
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    // Toggle: if same emoji by same user exists, remove; otherwise set to that emoji (replace any existing reaction by user)
    const existingIdx = msg.reactions.findIndex(r => r.user.toString() === userId.toString());
    if (existingIdx !== -1) {
      if (msg.reactions[existingIdx].emoji === emoji) {
        msg.reactions.splice(existingIdx, 1);
      } else {
        msg.reactions[existingIdx].emoji = emoji;
        msg.reactions[existingIdx].createdAt = new Date();
      }
    } else {
      msg.reactions.push({ user: userId, emoji });
    }

    await msg.save();
    await msg.populate('sender', 'username fullName avatar');
    await msg.populate('recipient', 'username fullName avatar');

    const io = req.app.get('io');
    if (io) {
      io.to(msg.recipient.toString()).emit('messageReaction', { messageId: msg._id, reactions: msg.reactions });
      io.to(msg.sender.toString()).emit('messageReaction', { messageId: msg._id, reactions: msg.reactions });
    }

    res.json({ messageId: msg._id, reactions: msg.reactions });
  } catch (error) {
    console.error('Add reaction error:', error);
    res.status(500).json({ error: 'Server error while adding reaction' });
  }
};

// @desc    Remove a reaction explicitly
// @route   DELETE /api/messages/:messageId/reactions
// @access  Private
const removeReaction = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;

    const msg = await Message.findById(messageId);
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    const before = msg.reactions.length;
    msg.reactions = msg.reactions.filter(r => {
      if (emoji) {
        return !(r.user.toString() === userId.toString() && r.emoji === emoji);
      }
      return r.user.toString() !== userId.toString();
    });

    if (msg.reactions.length === before) {
      return res.status(404).json({ error: 'Reaction not found' });
    }

    await msg.save();

    const io = req.app.get('io');
    if (io) {
      io.to(msg.recipient.toString()).emit('messageReaction', { messageId: msg._id, reactions: msg.reactions });
      io.to(msg.sender.toString()).emit('messageReaction', { messageId: msg._id, reactions: msg.reactions });
    }

    res.json({ messageId: msg._id, reactions: msg.reactions });
  } catch (error) {
    console.error('Remove reaction error:', error);
    res.status(500).json({ error: 'Server error while removing reaction' });
  }
};
// @desc    Mark message as read
// @route   PUT /api/messages/:messageId/read
// @access  Private
const markAsRead = async (req, res) => {
  try {
    const messageId = req.params.messageId;
    const userId = req.user._id;

    const message = await Message.findOneAndUpdate(
      {
        _id: messageId,
        recipient: userId,
        isRead: false
      },
      {
        isRead: true,
        readAt: new Date()
      },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({ error: "Message not found or already read" });
    }

    res.json({ message: "Message marked as read" });
  } catch (error) {
    console.error("Mark as read error:", error);
    res.status(500).json({ error: "Server error while marking message as read" });
  }
};

// @desc    Get mutual followers for new chat
// @route   GET /api/messages/mutual-followers
// @access  Private
const getMutualFollowers = async (req, res) => {
  try {
    const currentUserId = req.user._id;

    // Get current user with followers and following
    const currentUser = await User.findById(currentUserId)
      .populate('followers', '_id username fullName avatar')
      .populate('following', '_id username fullName avatar');

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Find mutual followers (users who follow current user AND current user follows them)
    const mutualFollowers = currentUser.followers.filter(follower => 
      currentUser.following.some(following => 
        following._id.toString() === follower._id.toString()
      )
    );

    res.json({
      mutualFollowers: mutualFollowers.map(user => ({
        _id: user._id,
        username: user.username,
        fullName: user.fullName,
        avatar: user.avatar
      }))
    });

  } catch (error) {
    console.error('Get mutual followers error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getConversations,
  getMessages,
  sendMessage,
  getThreadMessages,
  markAsRead,
  getMutualFollowers,
  editMessage,
  addReaction,
  removeReaction,
  getUnreadCount,
  uploadVoiceNote,
};
