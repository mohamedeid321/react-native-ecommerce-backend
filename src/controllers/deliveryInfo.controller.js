import DeliveryInfo from "../models/deliveryInfo.model.js";
import { CITIES, GOVERNORATE, MAX_NEIGHBORHOOD } from "../config/shop.js";
import { fail, serverError } from "../utils/http.js";

const toEnglishDigits = (v) =>
  String(v ?? "").replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).trim();
const PHONE_RE = /^01[0125]\d{8}$/; // موبايل مصري

export const getDeliveryInfo = async (req, res) => {
  try {
    const info = await DeliveryInfo.findOne({ user: req.user._id });
    res.json({ success: true, deliveryInfo: info || null });
  } catch (error) {
    serverError(res, error, "getDeliveryInfo");
  }
};

// إنشاء أو تحديث (واحدة لكل مستخدم)
export const saveDeliveryInfo = async (req, res) => {
  try {
    const b = req.body || {};
    const text = (v) => String(v ?? "").trim();

    const data = {
      city: text(b.city),
      governorate: GOVERNORATE, // ثابتة مهما اتبعت
      neighborhood: Number(toEnglishDigits(b.neighborhood)),
      building: text(b.building),
      apartment: text(b.apartment),
      floor: text(b.floor),
      street: text(b.street),
      landmark: text(b.landmark),
      phone1: toEnglishDigits(b.phone1),
      phone2: toEnglishDigits(b.phone2),
    };

    if (!CITIES.includes(data.city)) return fail(res, 400, "اختار المدينة");
    if (!Number.isInteger(data.neighborhood) || data.neighborhood < 1 || data.neighborhood > MAX_NEIGHBORHOOD) {
      return fail(res, 400, `اختار المجاورة من 1 إلى ${MAX_NEIGHBORHOOD}`);
    }
    if (!data.building) return fail(res, 400, "اكتب رقم العمارة");
    if (!data.apartment) return fail(res, 400, "اكتب رقم الشقة");
    if (!data.floor) return fail(res, 400, "اكتب رقم الدور");
    if (!PHONE_RE.test(data.phone1)) return fail(res, 400, "رقم الهاتف 1 غير صحيح");
    if (data.phone2 && !PHONE_RE.test(data.phone2)) return fail(res, 400, "رقم الهاتف 2 غير صحيح");

    const info = (await DeliveryInfo.findOne({ user: req.user._id })) ||
      new DeliveryInfo({ user: req.user._id });
    info.set(data);
    await info.save();

    res.json({ success: true, message: "تم تحديث معلومات التوصيل", deliveryInfo: info });
  } catch (error) {
    serverError(res, error, "saveDeliveryInfo");
  }
};
