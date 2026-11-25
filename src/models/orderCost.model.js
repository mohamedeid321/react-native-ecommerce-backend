import mongoose from "mongoose";
const schema=new mongoose.Schema({
 order:{type:mongoose.Schema.Types.ObjectId,ref:"Order",required:true,unique:true},
 lines:[{_id:false,product:{type:mongoose.Schema.Types.ObjectId,ref:"Product",required:true},quantity:{type:Number,required:true},unitCost:{type:Number,required:true},cost:{type:Number,required:true},purchase:{type:mongoose.Schema.Types.ObjectId,ref:"Purchase",required:true}}],
 total:{type:Number,required:true,min:0},
 basis:{type:String,enum:["scheduled_day_purchase_estimate"],required:true},
 recordedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true}
},{timestamps:true});
export default mongoose.models.OrderCost||mongoose.model("OrderCost",schema);
