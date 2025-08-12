const User = require('../models/User');
const Notification = require('../models/Notification');
const { sendPushToUser } = require('../utils/pushSender');

exports.followUser = async (req, res) => {
  try {
    const userToFollow = await User.findById(req.params.userId);
    const currentUser = await User.findById(req.user._id);

    if (!userToFollow || !currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent self-follow
    if (userToFollow._id.toString() === currentUser._id.toString()) {
      return res.status(400).json({ message: "You can't follow yourself" });
    }

    if (currentUser.following.includes(userToFollow._id)) {
      // Unfollow logic
      currentUser.following.pull(userToFollow._id);
      userToFollow.followers.pull(currentUser._id);

      await currentUser.save();
      await userToFollow.save();

      return res.json({ 
        message: 'User unfollowed successfully',
        isFollowing: false,
        followersCount: userToFollow.followers.length
      });
    } else {
      // Follow logic
      currentUser.following.push(userToFollow._id);
      userToFollow.followers.push(currentUser._id);

      await currentUser.save();
      await userToFollow.save();

      // Create a follow notification for the recipient
      const note = await Notification.create({
        user: userToFollow._id,
        type: 'follow',
        from: currentUser._id,
        text: `${currentUser.fullName} started following you`,
      });

      // Populate minimal fields for realtime payload
      const populated = await Notification.findById(note._id)
        .populate('from', 'fullName avatar username');

      // Emit real-time notification via Socket.IO (recipient room)
      try {
        const io = req.app.get('io');
        if (io && userToFollow._id) {
          io.to(userToFollow._id.toString()).emit('notification', populated);
        }
      } catch (e) {
        console.warn('Socket emit failed for follow notification:', e?.message || e);
      }

      // Also send Web Push to recipient
      sendPushToUser(userToFollow._id, {
        title: 'New follower',
        body: `${currentUser.fullName} started following you`,
        url: '/alerts',
        tag: 'mesh-follow',
      });

      return res.json({ 
        message: 'User followed successfully',
        isFollowing: true,
        followersCount: userToFollow.followers.length
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
