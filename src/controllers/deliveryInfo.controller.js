import mongoose from 'mongoose';
import SavedAddress,{addressRecord} from '../models/savedAddress.model.js';
import DeliveryInfo from "../models/deliveryInfo.model.js";
import { CITIES, GOVERNORATE, MAX_NEIGHBORHOOD } from "../config/shop.js";
import { fail, serverError } from "../utils/http.js";

const toEnglishDigits = (v) =>
  String(v ?? "").replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).trim();
const PHONE_RE = /^01[0125]\d{8}$/; // موبايل مصري

export const getDeliveryInfo = async (req, res) => {
  try {
    const info = await DeliveryInfo.findOne({ user: req.user._id });
    const saved=await SavedAddress.find({user:req.user._id}).sort({updatedAt:-1}).lean();
    const current=info?addressRecord(info):null;
    res.json({success:true,deliveryInfo:info,addresses:[...(current?[current]:[]),...saved.filter(a=>a.key!==current?.key).map(a=>a.address)]});
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

    const selected=addressRecord(data);
    await mongoose.connection.transaction(async session=>{
      const user=req.user._id;
      const previous=await DeliveryInfo.findOne({user}).session(session);
      const records=[selected];
      if(previous && addressRecord(previous).key!==selected.key)records.push(addressRecord(previous));
      for(const address of records)await SavedAddress.updateOne({user,key:address.key},{$setOnInsert:{address}},{upsert:true,session});
      await DeliveryInfo.findOneAndUpdate({user},{$set:data},{upsert:true,runValidators:true,session});
    });
    res.json({success:true,deliveryInfo:selected,addressKey:selected.key});
  } catch (error) {
    serverError(res, error, "saveDeliveryInfo");
  }
};

