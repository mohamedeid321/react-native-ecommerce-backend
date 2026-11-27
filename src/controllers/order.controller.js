import {hasAdminPermission} from '../config/adminPermissions.js';
import GuestContact from '../models/guestContact.model.js';
import {attachGuestContacts,guestContactExpiry,guestContactCutoff,guestPhoneFingerprint} from '../utils/guestContact.js';
import {guestTrackingToken,matchesGuestToken,trackingCutoff} from '../utils/guestTracking.js';
import {createHash} from 'node:crypto';
import {checkoutAddress,checkoutPhone} from '../utils/checkoutAddress.js';
import SavedAddress,{addressRecord} from '../models/savedAddress.model.js';
import {publicCache} from '../lib/publicCache.js';
import {getShopSettings,servesAddress} from "../models/shopSettings.model.js";
import mongoose from "mongoose";
import {checkoutGate} from "../utils/checkoutGate.js";
import { scheduledDeliveryDate } from "../utils/deliverySchedule.js";
import Cart from "../models/cart.model.js";
import Product from "../models/product.model.js";
import DeliveryInfo from "../models/deliveryInfo.model.js";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import Counter from "../models/counter.model.js";
import { notifyAdmins, notifyUser } from "../utils/notify.js";
import {
  ADMIN_TRANSITIONS,
  CUSTOMER_STATUS_MESSAGES,
  CURRENT_STATUSES,
  CUSTOMER_CANCELLABLE,
  FINISHED_STATUSES,
  ORDER_STATUSES,
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

const receipt=(order,key)=>({orderNumber:order.orderNumber,total:order.total,deliveryDate:order.deliveryDate,deliverySlot:order.deliverySlot,source:order.source,trackingToken:guestTrackingToken(order,key)});

function guestLines(lines){
 if(!Array.isArray(lines)||!lines.length||lines.length>50)throw Error('راجع المنتجات الموجودة في السلة');
 const seen=new Set();
 return lines.map(line=>{
  const {productId,quantity}=line??{};
  if(typeof productId!=='string'||!isValidId(productId)||seen.has(productId.toLowerCase())||
     !Number.isFinite(quantity)||quantity<0.001||quantity>99||Math.abs(quantity*1000-Math.round(quantity*1000))>1e-8)
   throw Error('راجع المنتجات والكميات الموجودة في السلة');
  seen.add(productId.toLowerCase());
  return {product:productId.toLowerCase(),quantity};
 });
}

function checkout({guest=false,quote=false}={}){
 return async (req,res)=>{
  const key=req.get('Idempotency-Key');
  if(!quote&&(guest||req.authMode==='web')&&!key)return fail(res,400,'مفتاح الطلب مطلوب');
  if(key!==undefined&&!/^[a-zA-Z0-9_-]{16,128}$/.test(key))return fail(res,400,'مفتاح الطلب غير صالح');
  const user=req.user;
  const identity=guest?{source:'guest',user:null}:{user:user._id};
  const prior={...identity,checkoutKey:key};
  const reply=(order,status)=>res.status(status).json({success:true,message:'تم استلام طلبك. سيتواصل معك فريق خدمة العملاء اليوم لتأكيد الطلب قبل بدء التجهيز.',order:guest?receipt(order,key):order});
  const reject=(status,message)=>{throw Object.assign(new Error(message),{checkoutStatus:status})};
  let session,release,order,preview,replayed;
  try{
   if(!quote&&key){
    const existing=await Order.findOne(prior);
    if(existing)return reply(existing,200);
   }
   const deliverySlot=req.body?.deliverySlot;
   if(deliverySlot!==undefined&&!([16,17,18,19].includes(deliverySlot)))return fail(res,400,'اختار فترة توصيل صحيحة');
   let lines,info,name;
   if(guest){
    if(!req.body?.delivery&&!quote)return fail(res,404,'لم يتم تسجيل الطلب السابق');
    name=typeof req.body?.name==='string'?req.body.name.trim().replace(/\s+/g,' '):'';
    if(name.length>100||name.split(' ').length<2||!name.split(' ').every(part=>/^\p{L}[\p{L}\p{M}'’.-]*$/u.test(part)))
     return fail(res,400,'اكتب اسمك الثنائي');
    try{info=checkoutAddress(req.body.delivery);lines=guestLines(req.body.items)}catch(e){return fail(res,400,e.message)}
   }
   release=await checkoutGate.acquire();
   if(!release){res.set('Retry-After','1');return fail(res,503,'الطلبات مشغولة حالياً، جرّب مرة تانية')}
   session=await mongoose.startSession();
   await session.withTransaction(async()=>{
    replayed=false;
    if(!quote&&key){
     order=await Order.findOne(prior).session(session);
     if(order){replayed=true;return}
    }
    const settings=await getShopSettings(session);
    if(!settings.acceptingOrders)reject(409,'استقبال الطلبات متوقف مؤقتاً');
    let cart,delivery=info,itemsInput=lines;
    if(!guest){
     if(req.authMode==='web'&&!/^\+201[0125]\d{8}$/.test(user.phone??''))reject(400,'أكمل رقم تليفونك أولاً');
     cart=await Cart.findOne({user:user._id}).session(session);
     if(!cart?.items.length)reject(400,'السلة فاضية');
     itemsInput=cart.items;
     delivery=await DeliveryInfo.findOne({user:user._id}).session(session);
     const addressKey=req.body?.addressKey;
     if(addressKey!==undefined){
      if(typeof addressKey!=='string'||! /^[a-f0-9]{64}$/.test(addressKey))reject(400,'عنوان غير صالح');
      if(!delivery||addressRecord(delivery).key!==addressKey)delivery=(await SavedAddress.findOne({user:user._id,key:addressKey}).session(session))?.address;
     }
    }
    if(!delivery)reject(400,'أكمل معلومات التوصيل أولاً');
    if(!servesAddress(settings,delivery))reject(400,'التوصيل غير متاح في هذه المنطقة حالياً');
    // Every accepted order writes the same counter inside its transaction. A concurrent write
    // retries with a fresh snapshot before checking the order history and the promotion.
    const counter=quote?null:await Counter.findOneAndUpdate({_id:'order'},{$inc:{seq:1}},{upsert:true,new:true,session});
    const phone=checkoutPhone(delivery.phone1);
    const accountPhone=checkoutPhone(user?.phone);
    const phones=[...new Set([phone,accountPhone].filter(Boolean).flatMap(n=>[n,'+2'+n,'002'+n]))];
    const history=[{'delivery.phone1':{$in:phones}},{accountPhone:{$in:phones}}];
    if(process.env.JWT_ACCESS_SECRET&&phones.length)history.push({guestPhoneHash:{$in:[...new Set([phone,accountPhone].filter(Boolean))].map(guestPhoneFingerprint)}});
    if(guest&&!quote&&!process.env.JWT_ACCESS_SECRET)reject(503,'إتمام طلبات الضيوف غير متاح مؤقتًا');
    if(user)history.push({user:user._id});
    if(settings.firstOrderFree){
     const linked=await User.findOne({phone:{$in:phones},role:'customer'}).select('_id').session(session);
     if(linked)history.push({user:linked._id});
    }
    const firstOrder=settings.firstOrderFree&&!(await Order.exists({$or:history}).session(session));
    const products=await Product.find({_id:{$in:itemsInput.map(i=>i.product)},isActive:{$ne:false}}).session(session);
    const byId=new Map(products.map(p=>[String(p._id),p]));
    const items=[...itemsInput].sort((a,b)=>String(a.product).localeCompare(String(b.product))).map(line=>{
     const p=byId.get(String(line.product)),quantity=line.quantity;
     if(!p)reject(409,'فيه منتج في السلة لم يعد متاحاً، راجع السلة');
     if(!Number.isFinite(quantity)||quantity<0.001||quantity>99)reject(400,'الكمية غير صحيحة');
     if(p.stock<quantity)reject(409,'المخزون غير كافٍ');
     const unitPrice=unitPriceOf(p);
     return {product:p._id,name:p.name,image:p.image,unit:p.unit,unitPrice,quantity,lineTotal:round2(unitPrice*quantity),stock:p.stock};
    });
    const totals=computeTotals(items,{...settings,firstOrder});
    const deliveryDate=scheduledDeliveryDate(new Date(),deliverySlot===undefined?settings.cutoffHour:24);
    const pricedItems=items.map(({product,quantity,unitPrice})=>[String(product),quantity,unitPrice]);
    const quoteKey=createHash('sha256').update(JSON.stringify(deliverySlot===undefined?[pricedItems,totals,deliveryDate]:[pricedItems,totals,deliveryDate,deliverySlot])).digest('hex');
    if(quote){preview={items,...totals,deliveryDate,deliverySlot,quoteKey};return}
    if((guest||req.body?.quoteKey!==undefined)&&req.body?.quoteKey!==quoteKey)
     reject(409,'الإجمالي أو موعد التوصيل اتغيّر. راجع الطلب قبل التأكيد.');
    for(const {product,quantity} of items){
     const result=await Product.updateOne({_id:product,isActive:{$ne:false},stock:{$gte:quantity}},{$inc:{stock:-quantity}},{session});
     if(!result.modifiedCount)reject(409,'المخزون غير كافٍ');
    }
    const address=Object.fromEntries(['city','governorate','neighborhood','building','apartment','floor','street','landmark','phone1','phone2'].map(k=>[k,delivery[k]]));
    address.whatsapp=delivery.whatsapp||address.phone1;
    const guestContactExpiresAt=guest?guestContactExpiry():undefined;
    let contact;
    if(guest){
     const {phone1,phone2,whatsapp}=address;
     contact={phone1:phone,phone2,whatsapp,expiresAt:guestContactExpiresAt};
     delete address.phone1;delete address.phone2;delete address.whatsapp;
    }
    const customer=guest?{username:name}:{username:user.displayName||user.username,email:user.email};
    [order]=await Order.create([{orderNumber:100000+counter.seq,...identity,guestContactExpiresAt,guestPhoneHash:guest?guestPhoneFingerprint(phone):undefined,accountPhone:accountPhone||undefined,items,...totals,delivery:address,customer,status:'placed',statusHistory:[{status:'placed'}],checkoutKey:key,deliveryDate,deliverySlot,paymentMethod:'cod',paymentStatus:'pending'}],{session});
    if(guest)await GuestContact.create([{_id:order._id,...contact}],{session});
    if(cart){cart.items=[];await cart.save({session})}
   });
   release();release=undefined;
   if(quote)return res.json({success:true,quote:preview});
   if(!replayed){
    await publicCache.invalidate('catalog','search');
    await notifyAdmins({title:'طلب جديد',body:`طلب #${order.orderNumber}`,orderId:order._id}).catch(()=>{});
   }
   return reply(order,replayed?200:201);
  }catch(error){
   if(error.checkoutStatus)return fail(res,error.checkoutStatus,error.message);
   if(!quote&&key&&error.code===11000){const existing=await Order.findOne(prior);if(existing)return reply(existing,200)}
   return serverError(res,error,'checkout');
  }finally{release?.();await session?.endSession()}
 };
}

export const createOrder=checkout();
export const quoteOrder=checkout({quote:true});
export const createGuestOrder=checkout({guest:true});
export const quoteGuestOrder=checkout({guest:true,quote:true});

async function findGuestTrackingOrder(body,includeItems=false){
 const {orderNumber,token}=body??{};
 if(typeof orderNumber!=='string'||!/^\d{1,12}$/.test(orderNumber)||
    typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token))return null;
 const fields='orderNumber source status statusHistory createdAt deliveryDate deliverySlot courierDeliveredAt guestContactExpiresAt +checkoutKey';
 const order=await Order.findOne({orderNumber:Number(orderNumber),source:'guest',createdAt:{$gte:trackingCutoff()}})
  .select(includeItems?fields+' items':fields).lean();
 return order&&matchesGuestToken(guestTrackingToken(order),token)?order:null;
}

export async function getGuestTracking(req,res){
 res.set('Cache-Control','no-store');
 const order=await findGuestTrackingOrder(req.body);
 if(!order)return fail(res,404,'رابط التتبع غير صالح أو انتهت صلاحيته');
 return res.json({order:publicGuestTracking(order)});
}

function publicGuestTracking(order){
 const {orderNumber,status,statusHistory,createdAt,deliveryDate,deliverySlot,courierDeliveredAt}=order;
 return {orderNumber,status,statusHistory,createdAt,deliveryDate,deliverySlot,courierDeliveredAt};
}

export async function listGuestOrdersByPhone(req,res){
 res.set('Cache-Control','no-store');
 const phone=checkoutPhone(req.body?.phone);
 if(!/^01[0125]\d{8}$/.test(phone))return fail(res,400,'اكتب رقم الموبايل المسجّل في الطلب');
 const now=new Date();
 const contacts=await GuestContact.find({phone1:phone,expiresAt:{$gt:now}}).sort({expiresAt:-1}).limit(25).select('_id').lean();
 const orders=await Order.find({source:'guest',$or:[
  {_id:{$in:contacts.map(contact=>contact._id)},guestContactExpiresAt:{$gt:now}},
  {guestContactExpiresAt:{$exists:false},'delivery.phone1':{$in:[phone,'+2'+phone,'002'+phone]},createdAt:{$gte:guestContactCutoff(now.getTime())}},
 ]}).sort({createdAt:-1}).limit(25).select('status statusHistory.status courierDeliveredAt -_id').lean();
 const tracking=orders.filter(order=>ORDER_STATUSES.includes(order.status)).map(order=>({
  status:order.status,
  statusHistory:[...new Set((order.statusHistory||[]).map(event=>event.status).filter(status=>ORDER_STATUSES.includes(status)))].map(status=>({status})),
  courierDeliveredAt:Boolean(order.courierDeliveredAt),
 }));
 return res.json({hasOrders:tracking.length>0,statuses:[...new Set(tracking.map(order=>order.status))],tracking});
}

export async function cancelGuestOrder(req,res){
 res.set('Cache-Control','no-store');
 const order=await findGuestTrackingOrder(req.body,true);
 if(!order)return fail(res,404,'رابط التتبع غير صالح أو انتهت صلاحيته');
 if(order.status==='cancelled')return res.json({success:true,message:'تم إلغاء الطلب'});
 if(!CUSTOMER_CANCELLABLE.includes(order.status))return fail(res,400,'لا يمكن إلغاء الطلب بعد خروجه للتوصيل');
 if(!await transition(order,'cancelled','customer'))return fail(res,409,'حالة الطلب اتغيرت، حدّث الصفحة');
 await notifyAdmins({title:'تم إلغاء طلب',body:`العميل ألغى الطلب #${order.orderNumber}`,orderId:order._id});
 return res.json({success:true,message:'تم إلغاء الطلب'});
}

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
    const allowed = order && (hasAdminPermission(req.user,"orders.read","orders.update","orders.cancel","dispatch.read","dispatch.assign","dispatch.approve") || String(order.user) === String(req.user._id));
    if (!allowed) return fail(res, 404, "الطلب غير موجود");
    const [visibleOrder]=req.user.role==="admin"?await attachGuestContacts([order]):[order];
    res.json({ success: true, order:visibleOrder });
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
 if(changed && status==="cancelled")await publicCache.invalidate("catalog","search");
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
    const {scope,status,date,overdue,courierId}=req.query;
    if(scope!==undefined&&!["current","finished","all"].includes(scope))return fail(res,400,"Invalid scope");
    const statuses=scope==="finished"?FINISHED_STATUSES:scope==="all"?ORDER_STATUSES:CURRENT_STATUSES;
    const filter={status:{$in:statuses}};
    if(status!==undefined){if(!ORDER_STATUSES.includes(status))return fail(res,400,"Invalid status");filter.status=status;}
    if(date!==undefined){if(typeof date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(date))return fail(res,400,"Invalid date");filter.deliveryDate=date;}
    if(courierId!==undefined){if(typeof courierId!=="string"||!isValidId(courierId))return fail(res,400,"Invalid courier");filter.courier=courierId;}
    if(overdue==="true"){if(status!==undefined&&!CURRENT_STATUSES.includes(status))return fail(res,400,"Invalid overdue status");filter.status=status??{$in:CURRENT_STATUSES};filter.deliveryDate={$lt:new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())};}
    const { skip, limit } = pageParams(req.query);

    const [orders, currentCount, finishedCount] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
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
    if (msg && order.user) {
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

