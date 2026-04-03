const Story = require("../models/Story");

const ACTIVE_STORY_WINDOW_MS = 24 * 60 * 60 * 1000;

const toStoryPayload = (story, viewerId) => {
  const viewCount = Array.isArray(story.views) ? story.views.length : 0;
  const isViewed = viewerId
    ? (story.views || []).some(
        (view) => String(view.user) === String(viewerId)
      )
    : false;

  return {
    _id: story._id,
    mediaUrl: story.mediaUrl,
    mediaType: story.mediaType,
    caption: story.caption || "",
    createdAt: story.createdAt,
    expiresAt: story.expiresAt,
    viewCount,
    isViewed,
  };
};

// @desc    Get active stories grouped by user
// @route   GET /api/posts/stories
// @access  Private
const getStories = async (req, res) => {
  try {
    const now = new Date();
    const stories = await Story.find({ expiresAt: { $gt: now } })
      .populate("user", "username fullName avatar isVerified")
      .sort({ createdAt: -1 });

    const groupedMap = new Map();

    for (const story of stories) {
      if (!story.user) continue;
      const userId = String(story.user._id);
      if (!groupedMap.has(userId)) {
        groupedMap.set(userId, {
          user: {
            _id: story.user._id,
            username: story.user.username,
            fullName: story.user.fullName,
            avatar: story.user.avatar,
            isVerified: !!story.user.isVerified,
          },
          stories: [],
          latestCreatedAt: story.createdAt,
          hasUnviewed: false,
        });
      }

      const group = groupedMap.get(userId);
      const payload = toStoryPayload(story, req.user._id);
      group.stories.push(payload);
      group.latestCreatedAt = group.latestCreatedAt > story.createdAt
        ? group.latestCreatedAt
        : story.createdAt;
      if (!payload.isViewed && String(req.user._id) !== userId) {
        group.hasUnviewed = true;
      }
    }

    const groups = Array.from(groupedMap.values())
      .map((group) => ({
        ...group,
        stories: group.stories.sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ),
      }))
      .sort((a, b) => {
        const aOwn = String(a.user._id) === String(req.user._id);
        const bOwn = String(b.user._id) === String(req.user._id);
        if (aOwn && !bOwn) return -1;
        if (!aOwn && bOwn) return 1;
        if (a.hasUnviewed !== b.hasUnviewed) return a.hasUnviewed ? -1 : 1;
        return new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime();
      });

    return res.json({ stories: groups });
  } catch (error) {
    console.error("Get stories error:", error);
    return res.status(500).json({ error: "Failed to fetch stories" });
  }
};

// @desc    Create a story
// @route   POST /api/posts/stories
// @access  Private
const createStory = async (req, res) => {
  try {
    const { mediaUrl, mediaType, caption = "" } = req.body;
    if (!mediaUrl) {
      return res.status(400).json({ error: "mediaUrl is required" });
    }
    if (!["image", "video"].includes(mediaType)) {
      return res.status(400).json({ error: "mediaType must be image or video" });
    }

    const story = await Story.create({
      user: req.user._id,
      mediaUrl,
      mediaType,
      caption: String(caption || "").trim(),
      expiresAt: new Date(Date.now() + ACTIVE_STORY_WINDOW_MS),
    });

    await story.populate("user", "username fullName avatar isVerified");

    const payload = {
      user: {
        _id: story.user._id,
        username: story.user.username,
        fullName: story.user.fullName,
        avatar: story.user.avatar,
        isVerified: !!story.user.isVerified,
      },
      stories: [toStoryPayload(story, req.user._id)],
      latestCreatedAt: story.createdAt,
      hasUnviewed: false,
    };

    const io = req.app.get("io");
    if (io) io.emit("storyCreated", payload);

    return res.status(201).json({ story: payload });
  } catch (error) {
    console.error("Create story error:", error);
    return res.status(500).json({ error: "Failed to create story" });
  }
};

// @desc    Mark a story as viewed
// @route   POST /api/posts/stories/:storyId/view
// @access  Private
const markStoryViewed = async (req, res) => {
  try {
    const { storyId } = req.params;
    const story = await Story.findOne({
      _id: storyId,
      expiresAt: { $gt: new Date() },
    });

    if (!story) {
      return res.status(404).json({ error: "Story not found" });
    }

    const alreadyViewed = (story.views || []).some(
      (view) => String(view.user) === String(req.user._id)
    );

    if (!alreadyViewed && String(story.user) !== String(req.user._id)) {
      story.views.push({ user: req.user._id, viewedAt: new Date() });
      await story.save();
    }

    return res.json({
      storyId: story._id,
      viewCount: Array.isArray(story.views) ? story.views.length : 0,
      isViewed: true,
    });
  } catch (error) {
    console.error("Mark story viewed error:", error);
    return res.status(500).json({ error: "Failed to update story view" });
  }
};

module.exports = {
  getStories,
  createStory,
  markStoryViewed,
};
