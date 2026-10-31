import Notification from "../models/notification.model.js";
import PushToken from "../models/pushToken.model.js";
import { sendPush } from "./push.js";

const dataOf = (orderId) => ({ type: "order", orderId: String(orderId || "") });

// إشعار لعميل: بيتحفظ في القايمة وبيتبعت push لأجهزته
export const notifyUser = async (userId, { title, body, orderId }) => {
  try {
    await Notification.create({ audience: "user", user: userId, title, body, data: dataOf(orderId) });
    const tokens = (await PushToken.find({ user: userId })).map((t) => t.token);
    await sendPush(tokens, { title, body, data: dataOf(orderId) });
  } catch (error) {
    console.log("notifyUser failed:", error.message);
  }
};

// إشعار لكل الـ admins
export const notifyAdmins = async ({ title, body, orderId }) => {
  try {
    await Notification.create({ audience: "admin", title, body, data: dataOf(orderId) });
    const tokens = (await PushToken.find({ role: "admin" })).map((t) => t.token);
    await sendPush(tokens, { title, body, data: dataOf(orderId) });
  } catch (error) {
    console.log("notifyAdmins failed:", error.message);
  }
};
