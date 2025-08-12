const express = require("express");
const webpush = require("web-push");
const PushSubscription = require("../models/PushSubscription");

const router = express.Router();

// Configure web-push from environment
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn("[web-push] Missing VAPID keys in env; push sending will be disabled");
}

// POST /api/push/subscribe
// Body: { userId, subscription }
router.post("/subscribe", async (req, res) => {
  try {
    const { userId, subscription } = req.body || {};
    if (!userId || !subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ error: "Invalid subscription payload" });
    }

    const doc = await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        userId,
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, id: doc._id });
  } catch (err) {
    console.error("[push] subscribe error", err);
    res.status(500).json({ error: "Failed to save subscription" });
  }
});

// POST /api/push/send (for testing)
// Body: { userId, notification: { title, body, icon, url } }
router.post("/send", async (req, res) => {
  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return res.status(503).json({ error: "Push not configured on server" });
    }
    const { userId, notification } = req.body || {};
    if (!userId || !notification) {
      return res.status(400).json({ error: "userId and notification required" });
    }

    const subs = await PushSubscription.find({ userId });
    const payload = JSON.stringify({
      title: notification.title || "Mesh",
      body: notification.body || "You have a new notification",
      icon: notification.icon || "/icon-192x192.png",
      url: notification.url || "/alerts",
      tag: "mesh-alert",
    });

    const results = await Promise.allSettled(
      subs.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload))
    );

    // Cleanup invalid subscriptions
    const toDelete = [];
    results.forEach((r, idx) => {
      if (r.status === "rejected") {
        const statusCode = r.reason?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          toDelete.push(subs[idx]._id);
        }
      }
    });
    if (toDelete.length) {
      await PushSubscription.deleteMany({ _id: { $in: toDelete } });
    }

    res.json({ success: true, sent: subs.length, removed: toDelete.length });
  } catch (err) {
    console.error("[push] send error", err);
    res.status(500).json({ error: "Failed to send push" });
  }
});

module.exports = router;
