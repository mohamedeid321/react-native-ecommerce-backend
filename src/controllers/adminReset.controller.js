import mongoose from 'mongoose';
import Order from '../models/order.model.js';
import OrderCost from '../models/orderCost.model.js';
import InventoryMovement from '../models/inventoryMovement.model.js';
import Notification from '../models/notification.model.js';
import Product from '../models/product.model.js';
import Counter from '../models/counter.model.js';
import User from '../models/user.model.js';
import {ShopSettings} from '../models/shopSettings.model.js';
import {CURRENT_STATUSES} from '../config/shop.js';
import {publicCache} from '../lib/publicCache.js';
import {checkAdminCode} from './adminMfa.controller.js';

export async function resetStoreData(req,res){
 const {orders,stock,confirmation,code}=req.body??{};
 if(typeof orders!=='boolean'||typeof stock!=='boolean'||(!orders&&!stock)||confirmation!=='RESET LOTTA'||!/^\d{6}$/.test(code??''))
  return res.status(400).json({message:'حدد البيانات واكتب عبارة التأكيد وكود Google Authenticator المكوّن من ٦ أرقام'});
 const admin=await User.findOne({_id:req.user._id,role:'admin',disabled:{$ne:true}}).select('+mfaSecret');
 if(!admin||!await checkAdminCode(admin,code))return res.status(403).json({message:'الكود غير صحيح أو اتستخدم بالفعل. انتظر الكود التالي.'});
 try{
  const changes=await mongoose.connection.transaction(async session=>{
   // Lock the same counter that serializes checkout; never reuse public order numbers.
   await Counter.updateOne({_id:'order'},{$inc:{seq:1}},{upsert:true,session});
   const paused=await ShopSettings.findOneAndUpdate({_id:'shop',acceptingOrders:false},{$inc:{__v:1}},{session});
   if(!paused)throw Object.assign(new Error('أوقف استقبال الطلبات من إعدادات التوصيل قبل الريسِت.'),{resetStatus:409});
   const active={status:{$in:CURRENT_STATUSES}};
   if(stock&&!orders&&await Order.exists(active).session(session))
    throw Object.assign(new Error('فيه طلبات شغالة. اقفلها الأول أو اختر تصفير الطلبات مع المخزون.'),{resetStatus:409});
   const result={orders:0,products:0};
   if(orders){
    if(!stock){
     const reserved=await Order.aggregate([{$match:active},{$unwind:'$items'},{$match:{'items.product':{$ne:null}}},{$group:{_id:'$items.product',quantity:{$sum:'$items.quantity'}}}]).session(session);
     if(reserved.length)await Product.bulkWrite(reserved.map(row=>({updateOne:{filter:{_id:row._id},update:{$inc:{stock:row.quantity}}}})),{session});
    }
    result.orders=(await Order.deleteMany({},{session})).deletedCount;
    await OrderCost.deleteMany({},{session});
    await Notification.deleteMany({'data.type':{$in:['order','guest-tracking']}},{session});
   }
   if(stock){
    result.products=(await Product.updateMany({stock:{$ne:0}},{$set:{stock:0}},{session})).modifiedCount;
    await InventoryMovement.deleteMany({},{session});
   }
   await mongoose.connection.collection('admin_reset_audit').insertOne({admin:admin._id,orders,stock,changes:result,at:new Date()},{session});
   return result;
  });
  await publicCache.invalidate('catalog','search');
  return res.json({success:true,changes});
 }catch(e){
  if(e.resetStatus)return res.status(e.resetStatus).json({message:e.message});
  throw e;
 }
}
