// إعدادات المتجر (غيّرها من هنا)
export const DELIVERY_FEE = Number(process.env.DELIVERY_FEE ?? 15); // سعر التوصيل بالجنيه
export const MAX_QTY = 99; // أقصى كمية للمنتج الواحد في السلة

export const CITIES = ["15 مايو", "حلوان"]; // المدن المتاحة
export const GOVERNORATE = "القاهرة"; // المحافظة ثابتة
export const MAX_NEIGHBORHOOD = 36; // مجاورة من 1 إلى 36

// حالات الطلب بالترتيب
export const ORDER_STATUSES = ["placed", "preparing", "out_for_delivery", "delivered", "cancelled"];
export const CURRENT_STATUSES = ["placed", "preparing", "out_for_delivery"]; // الطلبات الحالية
export const FINISHED_STATUSES = ["delivered", "cancelled"]; // الطلبات المنتهية

// الانتقالات المسموحة للـ admin
export const ADMIN_TRANSITIONS = {
  placed: ["preparing", "cancelled"],
  preparing: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: [],
};
// العميل يقدر يلغي بس قبل "خرج للتوصيل"
export const CUSTOMER_CANCELLABLE = ["placed", "preparing"];
