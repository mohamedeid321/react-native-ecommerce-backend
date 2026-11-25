import mongoose from "mongoose";
const schema=new mongoose.Schema({
 date:{type:String,required:true,match:/^\d{4}-\d{2}-\d{2}$/,index:true},
 category:{type:String,required:true,enum:["transport","packaging","labor","rent","utilities","marketing","other"]},
 amount:{type:Number,required:true,min:0.01,max:10000000},
 description:{type:String,required:true,maxlength:300},
 recordedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
 voided:{type:Boolean,default:false},
 voidedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User"},
 voidedAt:Date
},{timestamps:true});
export default mongoose.models.Expense||mongoose.model("Expense",schema);
