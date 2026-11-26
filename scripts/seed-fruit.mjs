import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import mongoose from 'mongoose';
import Product from '../src/models/product.model.js';
import {connectDB} from '../src/lib/db.js';
import cloudinary from '../src/lib/cloudinary.js';

const fruits=[
 ['persimmon','كاكا',26],['orange','برتقال',20],['mandarin','يوسفي (استفندي)',17],
 ['apple','تفاح أحمر',55],['golden','تفاح أصفر',55],['grapes','عنب كريمسون',30],
 ['black-grapes','عنب أسود',30],['mango','مانجا',30],['guava','جوافة',16],['melon','كانتالوب',25]
];

await connectDB();
try{
 for(const [slug,name,price] of fruits){
  const id=new mongoose.Types.ObjectId(createHash('sha256').update('lotta-fruit-v1/'+slug).digest('hex').slice(0,24));
  if(await Product.exists({$or:[{_id:id},{category:'fruits',name}]}))continue;
  const path=fileURLToPath(new URL('./catalog-art/'+slug+'.webp',import.meta.url));
  const {secure_url}=await cloudinary.uploader.upload(path,{public_id:'lotta-defaults/'+slug,overwrite:false});
  await Product.updateOne({_id:id},{$setOnInsert:{name,description:name+'، متنقية بالحبة ومعبأة بعناية.',category:'fruits',price,stock:0,unit:'كجم',image:secure_url,defaultImage:secure_url}},{upsert:true});
 }
 console.log('Lotta fruit catalog ready');
}finally{await mongoose.disconnect()}
