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
  getThreadMessages,
  uploadVoiceNote,
  uploadImageMessage,
  uploadVideoMessage,
} = require('../controllers/messageController');
const { auth } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB limit

// Get conversations
router.get('/conversations', auth, getConversations);

// Get mutual followers for new chat
router.get('/mutual-followers', auth, getMutualFollowers);

// Get total unread messages count (must be before dynamic :userId route)
router.get('/unread-count/total', auth, getUnreadCount);

// Get messages in a thread (root + replies) - placed BEFORE dynamic :userId route
router.get('/thread/:threadId', auth, getThreadMessages);

// Get messages between two users
router.get('/:userId', auth, getMessages);

// Send a message
router.post('/', auth, sendMessage);

// Upload a voice note
router.post('/voice', auth, upload.single('audio'), uploadVoiceNote);

// Upload an image message
router.post('/image', auth, upload.single('image'), uploadImageMessage);

// Upload a video message
router.post('/video', auth, upload.single('video'), uploadVideoMessage);

// Mark message as read
router.put('/:messageId/read', auth, markAsRead);

// Edit a message
router.put('/:messageId', auth, editMessage);

// Reactions
router.post('/:messageId/reactions', auth, addReaction);
router.delete('/:messageId/reactions', auth, removeReaction);

module.exports = router;
