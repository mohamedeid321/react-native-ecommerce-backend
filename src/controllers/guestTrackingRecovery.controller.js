import {hasAdminPermission} from '../config/adminPermissions.js';
import Notification from '../models/notification.model.js';
import Order from '../models/order.model.js';
import {checkoutPhone} from '../utils/checkoutAddress.js';
import {guestTrackingToken,trackingCutoff} from '../utils/guestTracking.js';
import {isValidId} from '../utils/http.js';

const type='guest-tracking';
export async function listGuestTrackingRequests(req,res){
 const requests=await Notification.find({audience:'admin','data.type':type,readBy:{$size:0}})
  .sort({updatedAt:-1}).limit(50).select('body updatedAt').lean();
 const phones=requests.flatMap(r=>[r.body,'+2'+r.body,'002'+r.body]);
 const orders=await Order.find({source:'guest','delivery.phone1':{$in:phones},createdAt:{$gte:trackingCutoff()}})
  .select('source orderNumber status delivery.phone1 createdAt +checkoutKey').sort({createdAt:-1}).limit(200).lean();
 const byPhone=new Map();
 for(const order of orders){
  const phone=checkoutPhone(order.delivery.phone1),token=guestTrackingToken(order);
  if(!token)continue;
  if(!byPhone.has(phone))byPhone.set(phone,[]);
  byPhone.get(phone).push({orderNumber:order.orderNumber,status:order.status,...(hasAdminPermission(req.user,'tracking.edit')?{token}:{})});
 }
 return res.json({requests:requests.map(r=>({id:r._id,phone:r.body,orders:byPhone.get(r.body)||[]}))});
}

export async function closeGuestTrackingRequest(req,res){
 if(!isValidId(req.params.id))return res.sendStatus(404);
 const item=await Notification.updateOne({_id:req.params.id,'data.type':type},{$addToSet:{readBy:req.user._id}});
 return res.sendStatus(item.matchedCount?204:404);
}
