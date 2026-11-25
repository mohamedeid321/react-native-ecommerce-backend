import mongoose from "mongoose";
import {CITIES,MAX_NEIGHBORHOOD} from "../config/shop.js";
export const defaultSettings=()=>({deliveryFee:30,freeDeliveryThreshold:700,firstOrderFree:true,cutoffHour:22,acceptingOrders:true,deliveryAreas:CITIES.map(city=>({city,neighborhoods:Array.from({length:MAX_NEIGHBORHOOD},(_,i)=>i+1)}))});
const area=new mongoose.Schema({city:{type:String,enum:CITIES,required:true},neighborhoods:[{type:Number,min:1,max:MAX_NEIGHBORHOOD}]},{_id:false});
const schema=new mongoose.Schema({_id:{type:String,default:"shop"},deliveryFee:{type:Number,min:0,max:10000,default:30},freeDeliveryThreshold:{type:Number,min:0,max:1000000,default:700},firstOrderFree:{type:Boolean,default:true},cutoffHour:{type:Number,min:0,max:23,default:22},acceptingOrders:{type:Boolean,default:true},deliveryAreas:{type:[area],default:()=>defaultSettings().deliveryAreas},updatedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User"}},{timestamps:true});
export const ShopSettings=mongoose.models.ShopSettings||mongoose.model("ShopSettings",schema);
export async function getShopSettings(session){
 const q=ShopSettings.findById("shop").select("deliveryFee freeDeliveryThreshold firstOrderFree cutoffHour acceptingOrders deliveryAreas").lean();
 if(session)q.session(session);
 const saved=await q;
 const defaults=defaultSettings();
 if(saved)for(const key of Object.keys(defaults))if(saved[key]!==undefined)defaults[key]=saved[key];
 return defaults;
}
export const servesAddress=(settings,info)=>settings.deliveryAreas.some(a=>a.city===info.city&&a.neighborhoods.includes(info.neighborhood));
