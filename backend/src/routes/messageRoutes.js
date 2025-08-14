const express = require('express');
const router = express.Router();
const { 
  getConversations, 
  getMessages, 
  sendMessage, 
  markAsRead,
  getMutualFollowers,
  getUnreadCount,
  editMessage,
  addReaction,
  removeReaction,
} = require('../controllers/messageController');
const { auth } = require('../middleware/auth');

// Get conversations
router.get('/conversations', auth, getConversations);

// Get mutual followers for new chat
router.get('/mutual-followers', auth, getMutualFollowers);

// Get total unread messages count (must be before dynamic :userId route)
router.get('/unread-count/total', auth, getUnreadCount);

// Get messages between two users
router.get('/:userId', auth, getMessages);

// Send a message
router.post('/', auth, sendMessage);

// Mark message as read
router.put('/:messageId/read', auth, markAsRead);

// Edit a message
router.put('/:messageId', auth, editMessage);

// Reactions
router.post('/:messageId/reactions', auth, addReaction);
router.delete('/:messageId/reactions', auth, removeReaction);

module.exports = router;
