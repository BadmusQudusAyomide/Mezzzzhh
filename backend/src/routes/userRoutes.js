const express = require('express');
const router = express.Router();
const { followUser } = require('../controllers/userController');
const { auth } = require('../middleware/auth');

router.post('/:userId/follow', auth, followUser);

module.exports = router;
