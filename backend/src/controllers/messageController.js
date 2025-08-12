const Message = require('../models/Message');
const User = require('../models/User');
const { sendPushToUser } = require('../utils/pushSender');

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

// @desc    Get messages between two users
// @route   GET /api/messages/:userId
// @access  Private
const getMessages = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const otherUserId = req.params.userId;

    const messages = await Message.find({
      $or: [
        { sender: currentUserId, recipient: otherUserId },
        { sender: otherUserId, recipient: currentUserId }
      ]
    })
    .populate('sender', 'username fullName avatar')
    .populate('recipient', 'username fullName avatar')
    .sort({ createdAt: 1 });

    // Mark messages as read
    await Message.updateMany(
      {
        sender: otherUserId,
        recipient: currentUserId,
        isRead: false
      },
      {
        isRead: true,
        readAt: new Date()
      }
    );

    res.json({ messages });
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
    const { recipientId, content, messageType = 'text' } = req.body;
    const senderId = req.user._id;

    if (!recipientId || !content) {
      return res.status(400).json({ error: "Recipient and content are required" });
    }

    // Check if recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ error: "Recipient not found" });
    }

    const message = new Message({
      sender: senderId,
      recipient: recipientId,
      content,
      messageType
    });

    await message.save();

    // Populate sender and recipient info
    await message.populate('sender', 'username fullName avatar');
    await message.populate('recipient', 'username fullName avatar');

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
  markAsRead,
  getMutualFollowers,
  /** Return total unread messages for current user */
  async getUnreadCount(req, res) {
    try {
      const userId = req.user._id;
      const count = await require('../models/Message').countDocuments({
        recipient: userId,
        isRead: false,
      });
      res.json({ count });
    } catch (error) {
      console.error('Get unread messages count error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
};
