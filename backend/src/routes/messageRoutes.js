const express = require('express');
const router = express.Router();
const { 
  getConversations, 
  getMessages, 
  sendMessage, 
  markAsRead,
  getMutualFollowers 
} = require('../controllers/messageController');
const { auth } = require('../middleware/auth');

// Get conversations
router.get('/conversations', auth, getConversations);

// Get mutual followers for new chat
router.get('/mutual-followers', auth, getMutualFollowers);

// Get messages between two users
router.get('/:userId', auth, getMessages);

// Send a message
router.post('/', auth, sendMessage);

// Mark message as read
router.put('/:messageId/read', auth, markAsRead);

module.exports = router;
