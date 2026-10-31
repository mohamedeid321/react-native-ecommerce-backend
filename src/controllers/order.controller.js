import Cart from "../models/cart.model.js";
import Product from "../models/product.model.js";
import DeliveryInfo from "../models/deliveryInfo.model.js";
import Order from "../models/order.model.js";
import Counter from "../models/counter.model.js";
import { notifyAdmins, notifyUser } from "../utils/notify.js";
import {
  ADMIN_TRANSITIONS,
  CUSTOMER_STATUS_MESSAGES,
  CURRENT_STATUSES,
  CUSTOMER_CANCELLABLE,
  FINISHED_STATUSES,
} from "../config/shop.js";
import { computeTotals, round2, unitPriceOf } from "../utils/pricing.js";
import { fail, isValidId, serverError } from "../utils/http.js";

const restock = (items) =>
  Promise.all(
    items.filter((i) => i.product).map((i) =>
      Product.updateOne({ _id: i.product }, { $inc: { stock: i.quantity } }),
    ),
  );

// ---------------- العميل ----------------

// تأكيد الطلب: بياخد السلة + معلومات التوصيل، بيخصم المخزون، وبيفضي السلة
export const createOrder = async (req, res) => {
  const decremented = []; // عشان نرجّعها لو حصل فشل في النص
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart || cart.items.length === 0) return fail(res, 400, "السلة فاضية");

    const info = await DeliveryInfo.findOne({ user: req.user._id });
    if (!info) {
      return fail(res, 400, "من فضلك أكمل معلومات التوصيل أولاً", { code: "NO_DELIVERY_INFO" });
    }

    const products = await Product.find({ _id: { $in: cart.items.map((i) => i.product) } });
    const byId = new Map(products.map((p) => [String(p._id), p]));

    const items = [];
    for (const line of cart.items) {
      const p = byId.get(String(line.product));
      if (!p) return fail(res, 400, "فيه منتج في السلة لم يعد متاحاً، راجع السلة");
      const unitPrice = unitPriceOf(p);
      items.push({
        product: p._id,
        name: p.name,
        image: p.image,
        unit: p.unit,
        unitPrice,
        quantity: line.quantity,
        lineTotal: round2(unitPrice * line.quantity),
      });
    }

    // خصم المخزون بشكل شرطي (لو الكمية مش كفاية مش بيخصم)
    for (const item of items) {
      const result = await Product.updateOne(
        { _id: item.product, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } },
      );
      if (!result.modifiedCount) {
        await restock(decremented);
        return fail(res, 409, `الكمية المتاحة من "${item.name}" غير كافية، عدّل السلة`);
      }
      decremented.push(item);
    }

    const counter = await Counter.findOneAndUpdate(
      { _id: "order" },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    );

    const totals = computeTotals(items);
    const order = await Order.create({
      orderNumber: 100000 + counter.seq,
      user: req.user._id,
      items,
      ...totals,
      delivery: {
        city: info.city,
        governorate: info.governorate,
        neighborhood: info.neighborhood,
        building: info.building,
        apartment: info.apartment,
        floor: info.floor,
        street: info.street,
        landmark: info.landmark,
        phone1: info.phone1,
        phone2: info.phone2,
      },
      customer: { username: req.user.username, email: req.user.email },
      status: "placed",
      statusHistory: [{ status: "placed" }],
    });

    cart.items = [];
    await cart.save();

    // إشعار للـ admin بطلب جديد (مش بيوقّف الطلب لو فشل)
    await notifyAdmins({
      title: "طلب جديد",
      body: `طلب #${order.orderNumber} من ${req.user.username || "عميل"} بقيمة ${order.total} ج.م`,
      orderId: order._id,
    });

    res.status(201).json({ success: true, message: "تم استلام طلبك", order });
  } catch (error) {
    await restock(decremented).catch(() => {});
    serverError(res, error, "createOrder");
  }
};

const pageParams = (query, defaultLimit = 20) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};

// طلبات العميل (الأحدث أولاً)
export const getMyOrders = async (req, res) => {
  try {
    const { skip, limit } = pageParams(req.query);
    const orders = await Order.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    res.json({ success: true, orders });
  } catch (error) {
    serverError(res, error, "getMyOrders");
  }
};

// طلب واحد: صاحبه أو الـ admin
export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const order = isValidId(id) ? await Order.findById(id) : null;
    const allowed = order && (req.user.role === "admin" || String(order.user) === String(req.user._id));
    if (!allowed) return fail(res, 404, "الطلب غير موجود");
    res.json({ success: true, order });
  } catch (error) {
    serverError(res, error, "getOrderById");
  }
};

// يغيّر الحالة بشكل ذرّي (لو الحالة اتغيرت في نفس اللحظة الطلب بيفشل بدل ما يحصل تعارض)
const transition = async (order, status, cancelledBy = "") => {
  const result = await Order.updateOne(
    { _id: order._id, status: order.status },
    {
      $set: { status, ...(status === "cancelled" ? { cancelledBy } : {}) },
      $push: { statusHistory: { status, at: new Date() } },
    },
  );
  if (!result.modifiedCount) return false;
  if (status === "cancelled") await restock(order.items);
  return true;
};

// إلغاء من العميل: قبل "الخروج للتوصيل" بس، والمخزون بيرجع
export const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const order = isValidId(id) ? await Order.findById(id) : null;
    if (!order || String(order.user) !== String(req.user._id)) {
      return fail(res, 404, "الطلب غير موجود");
    }
    if (!CUSTOMER_CANCELLABLE.includes(order.status)) {
      return fail(res, 400, "لا يمكن إلغاء الطلب بعد خروجه للتوصيل");
    }
    if (!(await transition(order, "cancelled", "customer"))) {
      return fail(res, 409, "حالة الطلب اتغيرت، حدّث الصفحة");
    }
    await notifyAdmins({
      title: "تم إلغاء طلب",
      body: `العميل ألغى الطلب #${order.orderNumber}`,
      orderId: order._id,
    });
    res.json({ success: true, message: "تم إلغاء الطلب", order: await Order.findById(id) });
  } catch (error) {
    serverError(res, error, "cancelOrder");
  }
};

// ---------------- الـ admin ----------------

// scope=current (الافتراضي) | finished
export const getAllOrders = async (req, res) => {
  try {
    const finished = req.query.scope === "finished";
    const statuses = finished ? FINISHED_STATUSES : CURRENT_STATUSES;
    const { skip, limit } = pageParams(req.query);

    const [orders, currentCount, finishedCount] = await Promise.all([
      Order.find({ status: { $in: statuses } }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Order.countDocuments({ status: { $in: CURRENT_STATUSES } }),
      Order.countDocuments({ status: { $in: FINISHED_STATUSES } }),
    ]);

    res.json({ success: true, orders, currentCount, finishedCount });
  } catch (error) {
    serverError(res, error, "getAllOrders");
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const next = req.body.status;
    const order = isValidId(id) ? await Order.findById(id) : null;
    if (!order) return fail(res, 404, "الطلب غير موجود");

    if (!(ADMIN_TRANSITIONS[order.status] || []).includes(next)) {
      return fail(res, 400, "لا يمكن تغيير حالة الطلب إلى هذه الحالة");
    }
    if (!(await transition(order, next, "admin"))) {
      return fail(res, 409, "حالة الطلب اتغيرت، حدّث الصفحة");
    }
    const msg = CUSTOMER_STATUS_MESSAGES[next];
    if (msg) {
      await notifyUser(order.user, {
        title: msg.title,
        body: msg.body.replace("#{n}", `#${order.orderNumber}`),
        orderId: order._id,
      });
    }
    res.json({ success: true, message: "تم تحديث حالة الطلب", order: await Order.findById(id) });
  } catch (error) {
    serverError(res, error, "updateOrderStatus");
  }
};
