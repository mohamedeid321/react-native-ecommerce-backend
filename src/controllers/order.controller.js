import mongoose from "mongoose";
import { scheduledDeliveryDate } from "../utils/deliverySchedule.js";
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
export const createOrder = async (req,res) => {
 const key=req.get("Idempotency-Key");
 if(key!==undefined&&!/^[a-zA-Z0-9_-]{16,128}$/.test(key))return fail(res,400,"Invalid checkout key");
 const session=await mongoose.startSession();
 let order,replayed=false;
 const reject=(status,message)=>{throw Object.assign(new Error(message),{checkoutStatus:status});};
 try{
 await session.withTransaction(async()=>{
  replayed=false;
  if(key){order=await Order.findOne({user:req.user._id,checkoutKey:key}).session(session);if(order){replayed=true;return;}}
  const cart=await Cart.findOne({user:req.user._id}).session(session);
  if(!cart?.items.length)reject(400,"السلة فاضية");
  const info=await DeliveryInfo.findOne({user:req.user._id}).session(session);
  if(!info)reject(400,"من فضلك أكمل معلومات التوصيل أولاً");
  const products=await Product.find({_id:{$in:cart.items.map(i=>i.product)},isActive:{$ne:false}}).session(session);
  const byId=new Map(products.map(p=>[String(p._id),p]));
  const items=[];
  for(const line of cart.items){
   const p=byId.get(String(line.product));
   if(!p)reject(400,"فيه منتج في السلة لم يعد متاحاً، راجع السلة");
   const quantity=line.quantity;
   if(!Number.isFinite(quantity)||quantity<0.001||quantity>99)reject(400,"الكمية غير صحيحة");
   const unitPrice=unitPriceOf(p);
   const result=await Product.updateOne({_id:p._id,isActive:{$ne:false},stock:{$gte:quantity}},{$inc:{stock:-quantity}},{session});
   if(!result.modifiedCount)reject(409,"المخزون غير كافٍ");
   items.push({product:p._id,name:p.name,image:p.image,unit:p.unit,unitPrice,quantity,lineTotal:round2(unitPrice*quantity)});
  }
  const counter=await Counter.findOneAndUpdate({_id:"order"},{$inc:{seq:1}},{upsert:true,new:true,session});
  const firstOrder=!(await Order.exists({user:req.user._id,status:{$ne:"cancelled"}}).session(session));
  const totals=computeTotals(items,{firstOrder});
  const delivery=Object.fromEntries(["city","governorate","neighborhood","building","apartment","floor","street","landmark","phone1","phone2"].map(k=>[k,info[k]]));
  [order]=await Order.create([{orderNumber:100000+counter.seq,user:req.user._id,items,...totals,delivery,customer:{username:req.user.username,email:req.user.email},status:"placed",statusHistory:[{status:"placed"}],checkoutKey:key,deliveryDate:scheduledDeliveryDate(),paymentMethod:"cod",paymentStatus:"pending"}],{session});
  cart.items=[];await cart.save({session});
 });
 if(!replayed)await notifyAdmins({title:"طلب جديد",body:`طلب #${order.orderNumber}`,orderId:order._id}).catch(()=>{});
 return res.status(replayed?200:201).json({success:true,message:"تم استلام طلبك",order});
 }catch(error){
 if(error.checkoutStatus)return fail(res,error.checkoutStatus,error.message);
 if(key&&error.code===11000){const existing=await Order.findOne({user:req.user._id,checkoutKey:key});if(existing)return res.json({success:true,order:existing});}
 return serverError(res,error,"createOrder");
 }finally{await session.endSession();}
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
const transition = async (order,status,cancelledBy="")=>{
 const session=await mongoose.startSession();
 let changed=false;
 try{
 await session.withTransaction(async()=>{
  const result=await Order.updateOne({_id:order._id,status:order.status},{$set:{status,...(status==="cancelled"?{cancelledBy}:{})},$push:{statusHistory:{status,at:new Date()}}},{session});
  changed=Boolean(result.modifiedCount);
  if(changed&&status==="cancelled")for(const item of order.items)if(item.product)await Product.updateOne({_id:item.product},{$inc:{stock:item.quantity}},{session});
 });
 return changed;
 }finally{await session.endSession();}
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
