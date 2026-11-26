import mongoose from 'mongoose';
import {createHash} from 'node:crypto';

export const addressFields=['city','governorate','neighborhood','building','apartment','floor','street','landmark','phone1','phone2'];
export function addressRecord(address){
 const data=Object.fromEntries(addressFields.map(key=>[key,address[key]??'']));
 const key=createHash('sha256').update(JSON.stringify(data)).digest('hex');
 return {...data,key};
}
const savedSchema=new mongoose.Schema({user:{type:mongoose.Schema.Types.ObjectId,required:true},key:{type:String,required:true},address:{type:Object,required:true}},{timestamps:true});
savedSchema.index({user:1,key:1},{unique:true});
export default mongoose.model('SavedAddress',savedSchema);
