const webpush = require("web-push");
const PushSubscription = require("../models/PushSubscription");

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    configured = true;
    return true;
  }
  console.warn("[pushSender] Missing VAPID keys; push disabled");
  return false;
}

async function sendPushToUser(userId, notification) {
  try {
    if (!ensureConfigured()) return;
    const subs = await PushSubscription.find({ userId });
    if (!subs.length) return;

    const payload = JSON.stringify({
      title: notification.title || "Mesh",
      body: notification.body || "You have a new notification",
      icon: notification.icon || "/icon-192x192.png",
      url: notification.url || "/alerts",
      tag: notification.tag || "mesh-alert",
    });

    const results = await Promise.allSettled(
      subs.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload))
    );

    const toDelete = [];
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        const status = r.reason?.statusCode;
        if (status === 404 || status === 410) {
          toDelete.push(subs[i]._id);
        }
      }
    });
    if (toDelete.length) await PushSubscription.deleteMany({ _id: { $in: toDelete } });
  } catch (err) {
    console.error("[pushSender] failed to send push:", err?.message || err);
  }
}

module.exports = { sendPushToUser };
