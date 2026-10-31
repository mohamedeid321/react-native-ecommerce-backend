import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import { ORDER_STATUSES } from "../config/shop.js";
import { round2 } from "../utils/pricing.js";
import { serverError } from "../utils/http.js";

const TZ = "Africa/Cairo";
const LOW_STOCK = 5; // أقل أو يساوي كده = مخزون منخفض

// مفتاح اليوم بتوقيت القاهرة: 2026-10-31
const dayKey = (date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

// إحصائيات الـ admin (GET /api/stats?range=7|30)
// المبيعات = كل الطلبات ما عدا الملغية. الحسابات بتتم على طلبات الفترة بس.
export const getStats = async (req, res) => {
  try {
    const range = req.query.range === "30" ? 30 : 7;
    const since = new Date(Date.now() - range * 24 * 3600 * 1000);

    const [periodOrders, lowStock, productsCount, ...statusCounts] = await Promise.all([
      Order.find({ createdAt: { $gte: since } }),
      Product.find({ stock: { $lte: LOW_STOCK } }).sort({ stock: 1 }).limit(5),
      Product.countDocuments({}),
      ...ORDER_STATUSES.map((s) => Order.countDocuments({ status: s })),
    ]);

    const sales = periodOrders.filter((o) => o.status !== "cancelled");
    const cancelledCount = periodOrders.length - sales.length;
    const revenue = round2(sales.reduce((s, o) => s + o.total, 0));

    // آخر N يوم (حتى الأيام اللي مفيهاش طلبات بتظهر بصفر)
    const daily = [];
    const byDay = new Map();
    for (let i = range - 1; i >= 0; i--) {
      const key = dayKey(new Date(Date.now() - i * 24 * 3600 * 1000));
      const row = { date: key, orders: 0, revenue: 0 };
      daily.push(row);
      byDay.set(key, row);
    }
    for (const o of sales) {
      const row = byDay.get(dayKey(o.createdAt));
      if (row) {
        row.orders += 1;
        row.revenue = round2(row.revenue + o.total);
      }
    }

    // أكتر المنتجات مبيعاً (بالكمية)
    const perProduct = new Map();
    for (const o of sales) {
      for (const i of o.items) {
        const key = String(i.product || i.name);
        const row = perProduct.get(key) || { name: i.name, image: i.image, unit: i.unit, quantity: 0, revenue: 0 };
        row.quantity += i.quantity;
        row.revenue = round2(row.revenue + i.lineTotal);
        perProduct.set(key, row);
      }
    }
    const topProducts = [...perProduct.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5);

    const byStatus = Object.fromEntries(ORDER_STATUSES.map((s, i) => [s, statusCounts[i]]));

    res.json({
      success: true,
      range,
      revenue,
      ordersCount: sales.length,
      cancelledCount,
      avgOrder: sales.length ? round2(revenue / sales.length) : 0,
      customersCount: new Set(sales.map((o) => String(o.user))).size,
      productsCount,
      byStatus, // كل الوقت
      daily,
      topProducts,
      lowStock: lowStock.map((p) => ({ _id: p._id, name: p.name, image: p.image, unit: p.unit, stock: p.stock })),
    });
  } catch (error) {
    serverError(res, error, "getStats");
  }
};
