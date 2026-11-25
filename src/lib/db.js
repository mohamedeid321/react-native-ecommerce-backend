import mongoose from "mongoose";
let connecting;
export async function connectDB(){
 if(mongoose.connection.readyState===1)return mongoose.connection;
 if(!process.env.MONGO_URI)throw new Error("MONGO_URI required");
 if(!connecting)connecting=mongoose.connect(process.env.MONGO_URI,{serverSelectionTimeoutMS:5000,maxPoolSize:10}).then(c=>c.connection).finally(()=>{connecting=undefined;});
 return connecting;
}
