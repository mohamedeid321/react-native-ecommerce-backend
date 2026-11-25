import {createSingleFlight} from "../utils/singleFlight.js";
import express from "express";
import {ShopSettings,getShopSettings} from "../models/shopSettings.model.js";
import {CITIES,MAX_NEIGHBORHOOD} from "../config/shop.js";
import {protectRoute,adminRoute} from "../middleware/auth.middleware.js";
import {fail,serverError} from "../utils/http.js";
import {round2} from "../utils/pricing.js";
import {scheduledDeliveryDate} from "../utils/deliverySchedule.js";
const router=express.Router();
const publicFlight=createSingleFlight();
router.get("/",async(req,res)=>{
 try{const settings=await publicFlight("settings",()=>getShopSettings());res.set("Cache-Control","no-store");res.json({success:true,settings,nextDeliveryDate:scheduledDeliveryDate(new Date(),settings.cutoffHour)});}catch(e){serverError(res,e,"getShopSettings");}
});
router.patch("/",protectRoute,adminRoute,async(req,res)=>{
 try{
 const body=req.body;
 if(!body||typeof body!=="object"||Array.isArray(body)||!Object.keys(body).length)return fail(res,400,"Invalid settings");
 const patch={};
 for(const [key,value] of Object.entries(body)){
 if(["deliveryFee","freeDeliveryThreshold"].includes(key)){
 if(typeof value!=="number"||!Number.isFinite(value)||value<0||value>(key==="deliveryFee"?10000:1000000)||Math.abs(value-round2(value))>1e-8)return fail(res,400,"Invalid monetary setting");
 }else if(["firstOrderFree","acceptingOrders"].includes(key)){
 if(typeof value!=="boolean")return fail(res,400,"Invalid boolean setting");
 }else if(key==="cutoffHour"){
 if(!Number.isInteger(value)||value<0||value>23)return fail(res,400,"Invalid cutoff hour");
 }else if(key==="deliveryAreas"){
 if(!Array.isArray(value)||value.length>CITIES.length)return fail(res,400,"Invalid delivery areas");
 const seen=new Set();
 for(const a of value){
 if(!a||typeof a!=="object"||Object.keys(a).some(k=>!["city","neighborhoods"].includes(k))||!CITIES.includes(a.city)||seen.has(a.city)||!Array.isArray(a.neighborhoods)||a.neighborhoods.length>MAX_NEIGHBORHOOD||a.neighborhoods.some(n=>!Number.isInteger(n)||n<1||n>MAX_NEIGHBORHOOD)||new Set(a.neighborhoods).size!==a.neighborhoods.length)return fail(res,400,"Invalid delivery area");
 seen.add(a.city);
 }
 }else return fail(res,400,"Unknown setting");
 patch[key]=value;
 }
 await ShopSettings.findOneAndUpdate({_id:"shop"},{$set:{...patch,updatedBy:req.user._id}},{upsert:true,new:true,runValidators:true,setDefaultsOnInsert:true});
 res.set("Cache-Control","no-store");res.json({success:true,settings:await getShopSettings()});
 }catch(e){serverError(res,e,"updateShopSettings");}
});
export default router;
