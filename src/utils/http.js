import mongoose from "mongoose";

export const isValidId = (id) => mongoose.Types.ObjectId.isValid(String(id));

// رد خطأ موحد: الرسائل للمستخدم بالعربي، والتفاصيل التقنية في اللوج بس
export const fail = (res, status, message, extra = {}) =>
  res.status(status).json({ success: false, message, ...extra });

export const serverError = (res, error, where) => {
  console.log(`Error in ${where}`, error.message);
  return fail(res, 500, "حصلت مشكلة في السيرفر، حاول تاني");
};
