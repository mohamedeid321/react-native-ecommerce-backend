import express from "express";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import Purchase from "../models/purchase.model.js";
import {protectRoute,adminRoute} from "../middleware/auth.middleware.js";
import {fail,isValidId,serverError} from "../utils/http.js";
import {round2} from "../utils/pricing.js";
const router=express.Router();
router.use(protectRoute,adminRoute);
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const validDate=d=>typeof d==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
const qty=n=>Math.round(n*1000)/1000;
router.get("/",async(req,res)=>{
 try{
 const date=req.query.date??today();
 if(!validDate(date))return fail(res,400,"Invalid date");
 const [demand,actual]=await Promise.all([
 Order.aggregate([{$match:{deliveryDate:date,status:{$ne:"cancelled"}}},{$unwind:"$items"},{$group:{_id:"$items.product",name:{$first:"$items.name"},unit:{$first:"$items.unit"},requiredQuantity:{$sum:"$items.quantity"}}}]),
 Purchase.find({date}).lean()
 ]);
 const ids=[...new Set([...demand.map(d=>String(d._id)),...actual.map(a=>String(a.product))])].filter(isValidId);
 const products=await Product.find({_id:{$in:ids}}).select("name unit +purchasePrice").lean();
 const byId=new Map(products.map(p=>[String(p._id),p]));
 const byDemand=new Map(demand.map(d=>[String(d._id),d]));
 const byActual=new Map(actual.map(a=>[String(a.product),a]));
 const items=ids.map(id=>{
 const d=byDemand.get(id),a=byActual.get(id),p=byId.get(id);
 const requiredQuantity=qty(d?.requiredQuantity??0),actualQuantity=a?.quantity??0;
 const estimatedUnitCost=p?.purchasePrice??null;
 return {product:id,name:d?.name??p?.name??"Unknown",unit:d?.unit??p?.unit??"",requiredQuantity,actualQuantity,variance:qty(actualQuantity-requiredQuantity),estimatedUnitCost,estimatedCost:estimatedUnitCost===null?null:round2(requiredQuantity*estimatedUnitCost),actualUnitCost:a?.unitCost??null,actualCost:a?round2(actualQuantity*a.unitCost):null,recorded:Boolean(a),supplier:a?.supplier??"",notes:a?.notes??""};
 }).sort((a,b)=>a.name.localeCompare(b.name,"ar"));
 const totals={estimatedCost:round2(items.reduce((s,i)=>s+(i.estimatedCost??0),0)),actualCost:round2(items.reduce((s,i)=>s+(i.actualCost??0),0)),missingEstimates:items.filter(i=>i.requiredQuantity>0&&i.estimatedCost===null).length,unrecordedProducts:items.filter(i=>i.requiredQuantity>0&&!i.recorded).length};
 res.set("Cache-Control","no-store");res.json({success:true,date,items,totals,unlinkedDemand:demand.filter(d=>!isValidId(d._id))});
 }catch(e){serverError(res,e,"dailyPurchases");}
});
router.put("/:date/:productId",async(req,res)=>{
 try{
 const {date,productId}=req.params;
 const {quantity,unitCost,supplier="",notes=""}=req.body??{};
 if(!validDate(date)||!isValidId(productId)||typeof quantity!=="number"||!Number.isFinite(quantity)||quantity<0||quantity>1000000||Math.abs(quantity-qty(quantity))>1e-9||typeof unitCost!=="number"||!Number.isFinite(unitCost)||unitCost<0||unitCost>1000000||Math.abs(unitCost-round2(unitCost))>1e-9||typeof supplier!=="string"||supplier.length>120||typeof notes!=="string"||notes.length>500)return fail(res,400,"Invalid purchase data");
 if(!await Product.exists({_id:productId}))return fail(res,404,"Product not found");
 const purchase=await Purchase.findOneAndUpdate({date,product:productId},{$set:{quantity,unitCost,supplier:supplier.trim(),notes:notes.trim(),recordedBy:req.user._id}},{upsert:true,new:true,runValidators:true});
 res.json({success:true,purchase});
 }catch(e){if(e.code===11000)return fail(res,409,"Retry purchase update");serverError(res,e,"savePurchase");}
});
export default router;
