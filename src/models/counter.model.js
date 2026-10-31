import mongoose from "mongoose";

// عداد لرقم الطلب (#100001, #100002 ...)
const counterSchema = new mongoose.Schema({
  _id: String,
  seq: { type: Number, default: 100000 },
});

export default mongoose.models.Counter || mongoose.model("Counter", counterSchema);
