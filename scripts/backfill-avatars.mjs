import mongoose from 'mongoose';
import {connectDB} from '../src/lib/db.js';
import User from '../src/models/user.model.js';
import {customerAvatar} from '../src/lib/customerAvatar.js';

await connectDB();
try{
 const missing={role:'customer',profileImage:{$in:[null,'']}};
 let count=0;
 const cursor=User.collection.find(missing,{projection:{_id:1}});
 for await(const {_id} of cursor){
  const result=await User.collection.updateOne({_id,...missing},{$set:{profileImage:customerAvatar()}});
  count+=result.modifiedCount;
 }
 console.log('Customer avatars added:',count);
}finally{await mongoose.disconnect()}
