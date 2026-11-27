import {hasAdminPermission} from '../config/adminPermissions.js';
import Notification from "../models/notification.model.js";
import PushToken from "../models/pushToken.model.js";
import { fail, isValidId, serverError } from "../utils/http.js";

const mineFilter = (user) =>
  hasAdminPermission(user,"notifications.read") ? { $or: [{ user: user._id }, { audience: "admin" }] } : { user: user._id };

const present = (n, userId) => ({
  _id: n._id,
  title: n.title,
  body: n.body,
  data: n.data,
  createdAt: n.createdAt,
  read: n.readBy.some((id) => String(id) === String(userId)),
});

// تسجيل توكن الجهاز بعد تسجيل الدخول
export const registerToken = async (req, res) => {
  try {
    const token = String(req.body.token || "").trim();
    if (!/^Expo(nent)?PushToken\[.+\]$/.test(token)) return fail(res, 400, "توكن غير صحيح");

    const doc = (await PushToken.findOne({ token })) || new PushToken({ token });
    doc.set({
      user: req.user._id,
      role: hasAdminPermission(req.user,"notifications.read") ? "admin" : "customer",
      platform: String(req.body.platform || ""),
    });
    await doc.save();
    res.json({ success: true });
  } catch (error) {
    serverError(res, error, "registerToken");
  }
};

// مسح التوكن عند تسجيل الخروج (عشان إشعارات الحساب ماتوصلش للجهاز بعد الخروج)
export const removeToken = async (req, res) => {
  try {
    const token = String(req.body.token || "").trim();
    if (token) await PushToken.deleteMany({ token, user: req.user._id });
    res.json({ success: true });
  } catch (error) {
    serverError(res, error, "removeToken");
  }
};

export const getNotifications = async (req, res) => {
  try {
    const list = await Notification.find(mineFilter(req.user)).sort({ createdAt: -1 }).limit(50);
    const notifications = list.map((n) => present(n, req.user._id));
    res.json({
      success: true,
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
    });
  } catch (error) {
    serverError(res, error, "getNotifications");
  }
};

const markRead = async (docs, userId) => {
  for (const n of docs) {
    if (!n.readBy.some((id) => String(id) === String(userId))) {
      n.readBy.push(userId);
      await n.save();
    }
  }
};

export const markAllRead = async (req, res) => {
  try {
    await markRead(await Notification.find(mineFilter(req.user)).sort({ createdAt: -1 }).limit(200), req.user._id);
    res.json({ success: true });
  } catch (error) {
    serverError(res, error, "markAllRead");
  }
};

export const markOneRead = async (req, res) => {
  try {
    const { id } = req.params;
    const n = isValidId(id) ? await Notification.findById(id) : null;
    const mine = n && (String(n.user) === String(req.user._id) || (n.audience === "admin" && hasAdminPermission(req.user,"notifications.read")));
    if (!mine) return fail(res, 404, "الإشعار غير موجود");
    await markRead([n], req.user._id);
    res.json({ success: true });
  } catch (error) {
    serverError(res, error, "markOneRead");
  }
};

