import PushToken from "../models/pushToken.model.js";

const EXPO_URL = "https://exp.host/--/api/v2/push/send";
const VALID = /^Expo(nent)?PushToken\[.+\]$/;

// بيبعت إشعار لمجموعة توكنز عن طريق Expo. عمره ما بيرمي خطأ (الإشعار مش لازم يوقّف الطلب)
export const sendPush = async (tokens, { title, body, data = {} }) => {
  try {
    const list = [...new Set(tokens)].filter((t) => VALID.test(t));
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(EXPO_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(
            chunk.map((to) => ({ to, title, body, data, sound: "default", channelId: "default" })),
          ),
          signal: controller.signal,
        });
        const json = await res.json().catch(() => ({}));
        // الأجهزة اللي اتفسخ عليها التطبيق بنمسح توكنها
        const dead = (json.data || [])
          .map((ticket, idx) => (ticket?.details?.error === "DeviceNotRegistered" ? chunk[idx] : null))
          .filter(Boolean);
        if (dead.length) await PushToken.deleteMany({ token: { $in: dead } });
      } finally {
        clearTimeout(timer);
      }
    }
  } catch (error) {
    console.log("sendPush failed:", error.message);
  }
};
