import {getRedis} from "../lib/redis.js";
import {createSessionStore} from "../lib/sessionStore.js";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";
import {fail,isValidId,serverError} from "../utils/http.js";
import {notifyUser} from "../utils/notify.js";
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
export const listCouriers=async(req,res)=>{
 try{res.json({success:true,couriers:await User.find({role:"delivery"}).select("username displayName phone disabled").limit(200)});}catch(e){serverError(res,e,"listCouriers");}
};
export const assignCourier=async(req,res)=>{
 try{
 const {id}=req.params,{courierId,routeSequence}=req.body??{};
 if(routeSequence!==undefined&&(!Number.isInteger(routeSequence)||routeSequence<1||routeSequence>10000))return fail(res,400,"Invalid route sequence");
 if(!isValidId(id)||!isValidId(courierId))return fail(res,400,"Invalid ID");
 if(!await User.exists({_id:courierId,role:"delivery",disabled:{$ne:true}}))return fail(res,404,"Courier not found");
 const order=await Order.findOneAndUpdate({_id:id,status:{$in:["placed","preparing","out_for_delivery"]},courierDeliveredAt:null},{$set:{courier:courierId,assignedAt:new Date(),...(routeSequence===undefined?{}:{routeSequence})}},{new:true});
 if(!order)return fail(res,409,"Order cannot be assigned");
 res.json({success:true,order});
 }catch(e){serverError(res,e,"assignCourier");}
};
export const listCourierOrders=async(req,res)=>{
 try{
 const date=req.query.date??today();
 if(typeof date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(date))return fail(res,400,"Invalid date");
 const filter={courier:req.user._id,deliveryDate:date};
 if(req.query.overdue==="true"){filter.deliveryDate={$lt:today()};filter.status={$in:["placed","preparing","out_for_delivery"]};}
 if(req.query.status!==undefined){if(!["placed","preparing","out_for_delivery","delivered","cancelled"].includes(req.query.status))return fail(res,400,"Invalid status");if(req.query.overdue==="true"&&["delivered","cancelled"].includes(req.query.status))return fail(res,400,"Invalid overdue status");filter.status=req.query.status;}
 if(req.query.history==='true'){delete filter.deliveryDate;filter.status='delivered';}
 const page=Math.min(10000,Math.max(1,parseInt(req.query.page)||1));
 const orders=await Order.find(filter).sort(req.query.history==='true'?{approvedAt:-1,_id:-1}:{deliveryDate:1,routeSequence:1,createdAt:1}).skip((page-1)*50).limit(50);
 res.json({success:true,orders,page});
 }catch(e){serverError(res,e,"listCourierOrders");}
};
export const reportDelivered=async(req,res)=>{
 try{
 const {id}=req.params,{collectedAmount}=req.body;
 if(!isValidId(id)||typeof collectedAmount!=="number"||!Number.isFinite(collectedAmount)||collectedAmount<0)return fail(res,400,"Invalid delivery");
 const order=await Order.findOneAndUpdate({_id:id,courier:req.user._id,status:"out_for_delivery",courierDeliveredAt:null,total:collectedAmount},{$set:{courierDeliveredAt:new Date(),collectedAmount}},{new:true});
 if(!order)return fail(res,409,"Delivery cannot be recorded");
 res.json({success:true,order});
 }catch(e){serverError(res,e,"reportDelivered");}
};
export const approveDelivery=async(req,res)=>{
 try{
 if(!isValidId(req.params.id))return fail(res,400,"Invalid ID");
 const order=await Order.findOneAndUpdate({_id:req.params.id,status:"out_for_delivery",courierDeliveredAt:{$type:"date"},$expr:{$eq:["$collectedAmount","$total"]}},{$set:{status:"delivered",paymentStatus:"paid",approvedAt:new Date(),approvedBy:req.user._id},$push:{statusHistory:{status:"delivered",at:new Date()}}},{new:true});
 if(!order)return fail(res,409,"Delivery cannot be approved");
 await notifyUser(order.user,{title:"تم تسليم طلبك",body:"تم تأكيد تسليم طلبك",orderId:order._id}).catch(()=>{});
 res.json({success:true,order});
 }catch(e){serverError(res,e,"approveDelivery");}
};

export const createCourier=async(req,res)=>{
 try{
 const {username,email,phone,password}=req.body??{};
 if(typeof username!=="string"||username.trim().length<3||username.length>80||typeof email!=="string"||email.length>254||!/^\S+@\S+\.\S+$/.test(email)||typeof phone!=="string"||!/^\+201[0125]\d{8}$/.test(phone)||typeof password!=="string"||password.length<12||Buffer.byteLength(password)>72)return fail(res,400,"Invalid courier details");
 const user=await User.create({username:username.trim(),email:email.trim().toLowerCase(),phone,password,role:"delivery"});
 res.status(201).json({success:true,courier:{id:user.id,username:user.username,email:user.email,phone:user.phone,role:user.role}});
 }catch(e){if(e.code===11000)return fail(res,409,"Account already exists");serverError(res,e,"createCourier");}
};

export const setCourierDisabled=async(req,res)=>{
 try{
 const {id}=req.params,{disabled}=req.body??{};
 if(!isValidId(id)||typeof disabled!=="boolean")return fail(res,400,"Invalid courier status");
 const courier=await User.findOne({_id:id,role:"delivery"});
 if(!courier)return fail(res,404,"Courier not found");
 // Revoke before enabling; disable in Mongo first so access fails even if Redis is unavailable.
 if(disabled)await User.updateOne({_id:id,role:"delivery"},{$set:{disabled:true}});
 await createSessionStore(getRedis()).revokeAll(courier.id);
 if(!disabled)await User.updateOne({_id:id,role:"delivery"},{$set:{disabled:false}});
 return res.json({success:true,disabled});
 }catch(e){serverError(res,e,"setCourierDisabled");}
};
