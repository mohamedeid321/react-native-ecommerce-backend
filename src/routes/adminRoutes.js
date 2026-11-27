import {ownerOnly,listAdminTeam,addAdminTeamMember,updateAdminTeamMember,renewStaffActivation} from '../controllers/adminTeam.controller.js';
import {authRateLimit} from '../middleware/authRateLimit.js';
import {resetStoreData} from '../controllers/adminReset.controller.js';
import {listGuestTrackingRequests,closeGuestTrackingRequest} from '../controllers/guestTrackingRecovery.controller.js';
import express from "express";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import Notification from "../models/notification.model.js";
import {protectRoute,adminRoute} from "../middleware/auth.middleware.js";
import {CURRENT_STATUSES,ORDER_STATUSES} from "../config/shop.js";
import {cairoDate,validDate,cairoDayStart,shiftDay} from "../utils/financeDates.js";
import {fail,isValidId,serverError} from "../utils/http.js";
import {round2} from "../utils/pricing.js";
const router=express.Router();
router.use(protectRoute,adminRoute);
router.use((req,res,next)=>{res.set("Cache-Control","no-store");next();});
router.get('/team',ownerOnly,listAdminTeam);
router.post('/team',ownerOnly,authRateLimit('staff-create',15),addAdminTeamMember);
router.patch('/team/:id',ownerOnly,updateAdminTeamMember);
router.post('/team/:id/activation',ownerOnly,authRateLimit('staff-activate',15),renewStaffActivation);
router.post('/reset-data',authRateLimit('admin-reset',5),resetStoreData);
router.get('/guest-tracking-requests',listGuestTrackingRequests);
router.patch('/guest-tracking-requests/:id',closeGuestTrackingRequest);
const paging=q=>({page:Math.min(10000,Math.max(1,parseInt(q.page)||1)),limit:Math.min(100,Math.max(1,parseInt(q.limit)||20))});
const customerFields="username displayName email phone disabled createdAt";
router.get("/dashboard",async(req,res)=>{
 try{
 const date=req.query.date??cairoDate();if(!validDate(date))return fail(res,400,"Invalid date");
 const instant={$gte:cairoDayStart(date),$lt:cairoDayStart(shiftDay(date,1))};
 const active={status:{$in:CURRENT_STATUSES}};
 const pendingApproval={status:"out_for_delivery",courierDeliveredAt:{$type:"date"}};
 const [groups,booked,approved,collected,overdue,unassigned,pending,customers,couriers,lowStock,unread,recentOrders]=await Promise.all([
 Order.aggregate([{$match:{deliveryDate:date}},{$group:{_id:"$status",count:{$sum:1},total:{$sum:"$total"}}}]),
 Order.aggregate([{$match:{createdAt:instant,status:{$ne:"cancelled"}}},{$group:{_id:null,count:{$sum:1},total:{$sum:"$total"}}}]),
 Order.aggregate([{$match:{approvedAt:instant,status:"delivered"}},{$group:{_id:null,count:{$sum:1},total:{$sum:"$total"}}}]),
 Order.aggregate([{$match:{courierDeliveredAt:instant,collectedAmount:{$type:"number"}}},{$group:{_id:null,total:{$sum:"$collectedAmount"}}}]),
 Order.countDocuments({...active,deliveryDate:{$lt:date}}),
 Order.countDocuments({...active,deliveryDate:date,courier:null}),
 Order.countDocuments({...pendingApproval,deliveryDate:{$lte:date}}),
 User.countDocuments({role:"customer"}),
 User.countDocuments({role:"delivery",disabled:{$ne:true}}),
 Product.find({isActive:{$ne:false},stock:{$lte:5}}).select("name unit stock image").sort({stock:1}).limit(10).lean(),
 Notification.countDocuments({$or:[{audience:"admin"},{user:req.user._id}],readBy:{$ne:req.user._id}}),
 Order.find({deliveryDate:date}).select("orderNumber customer.username status total deliveryDate courier courierDeliveredAt").sort({createdAt:-1}).limit(10).lean()
 ]);
 const byStatus=Object.fromEntries(ORDER_STATUSES.map(s=>[s,groups.find(g=>g._id===s)?.count??0]));
 res.json({success:true,date,byStatus,scheduledOrders:Object.values(byStatus).reduce((s,n)=>s+n,0),bookedOrders:booked[0]?.count??0,bookedSales:round2(booked[0]?.total??0),approvedDeliveries:approved[0]?.count??0,realizedRevenue:round2(approved[0]?.total??0),cashCollected:round2(collected[0]?.total??0),alerts:{overdue,unassigned,pendingApproval:pending,unreadNotifications:unread},customers,activeCouriers:couriers,lowStock,recentOrders});
 }catch(e){serverError(res,e,"adminDashboard");}
});
router.get("/customers",async(req,res)=>{
 try{
 const {page,limit}=paging(req.query),filter={role:"customer"};
 if(req.query.q!==undefined){
 if(typeof req.query.q!=="string"||req.query.q.length>80)return fail(res,400,"Invalid search");
 const q=req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
 if(q)filter.$or=["username","displayName","email","phone"].map(field=>({[field]:{$regex:q,$options:"i"}}));
 }
 if(req.query.disabled!==undefined){if(!["true","false"].includes(req.query.disabled))return fail(res,400,"Invalid account filter");filter.disabled=req.query.disabled==="true"?true:{$ne:true};}
 const [customers,count]=await Promise.all([User.find(filter).select(customerFields).sort({createdAt:-1,_id:-1}).skip((page-1)*limit).limit(limit).lean(),User.countDocuments(filter)]);
 res.json({success:true,customers,count,page,limit});
 }catch(e){serverError(res,e,"listCustomers");}
});
router.get("/customers/:id",async(req,res)=>{
 try{
 if(!isValidId(req.params.id))return fail(res,400,"Invalid customer ID");
 const customer=await User.findOne({_id:req.params.id,role:"customer"}).select(customerFields).lean();
 if(!customer)return fail(res,404,"Customer not found");
 const {page,limit}=paging(req.query),filter={user:customer._id};
 const [orders,count,summary]=await Promise.all([
 Order.find(filter).select("orderNumber status subtotal deliveryFee total deliveryDate createdAt paymentStatus").sort({createdAt:-1,_id:-1}).skip((page-1)*limit).limit(limit).lean(),
 Order.countDocuments(filter),
 Order.aggregate([{$match:{...filter,status:"delivered",approvedAt:{$type:"date"}}},{$group:{_id:null,count:{$sum:1},total:{$sum:"$total"}}}])
 ]);
 res.json({success:true,customer,orders,count,page,limit,approvedOrders:summary[0]?.count??0,realizedRevenue:round2(summary[0]?.total??0),phoneVerified:false});
 }catch(e){serverError(res,e,"customerDetails");}
});
export default router;

