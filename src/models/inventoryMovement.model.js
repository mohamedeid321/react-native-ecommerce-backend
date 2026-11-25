import mongoose from "mongoose";
const schema=new mongoose.Schema({
 date:{type:String,required:true,match:/^\d{4}-\d{2}-\d{2}$/,index:true},
 product:{type:mongoose.Schema.Types.ObjectId,ref:"Product",required:true},
 type:{type:String,required:true,enum:["opening","adjustment_in","adjustment_out","waste"]},
 quantity:{type:Number,required:true,min:0.001,max:1000000},
 unitCost:{type:Number,min:0,max:1000000},
 reason:{type:String,required:true,maxlength:300},
 recordedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
 requestKey:{type:String,required:true,maxlength:128,unique:true}
},{timestamps:true});
schema.index({product:1,date:1});
export default mongoose.models.InventoryMovement||mongoose.model("InventoryMovement",schema);
