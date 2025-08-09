const User = require('../models/User');
const Notification = require('../models/Notification');

exports.followUser = async (req, res) => {
  try {
    const userToFollow = await User.findById(req.params.userId);
    const currentUser = await User.findById(req.user._id);

    if (!userToFollow || !currentUser) {
      return res.status(404).json({ message: 'User not found' });
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
