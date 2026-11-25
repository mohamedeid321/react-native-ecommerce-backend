import Cart from "../models/cart.model.js";
import Product from "../models/product.model.js";
import { MAX_QTY } from "../config/shop.js";
import { computeTotals, round2, unitPriceOf } from "../utils/pricing.js";
import { fail, isValidId, serverError } from "../utils/http.js";

const getCartDoc = async (userId) =>
  (await Cart.findOne({ user: userId })) || new Cart({ user: userId, items: [] });

// بيبني رد السلة: المنتجات بتفاصيلها + الإجماليات
// المنتجات اللي اتمسحت من المتجر بتتشال من السلة تلقائياً
const buildCartResponse = async (cart) => {
  const ids = cart.items.map((i) => i.product);
  const products = ids.length ? await Product.find({ _id: { $in: ids }, isActive: { $ne: false } }) : [];
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const live = cart.items.filter((i) => byId.has(String(i.product)));
  if (live.length !== cart.items.length) {
    cart.items = live;
    await cart.save();
  }

  const items = live.map((i) => {
    const p = byId.get(String(i.product));
    const unitPrice = unitPriceOf(p);
    return {
      product: String(p._id),
      name: p.name,
      image: p.image,
      unit: p.unit,
      category: p.category,
      price: p.price,
      discount: p.discount || 0,
      unitPrice,
      stock: p.stock,
      quantity: i.quantity,
      lineTotal: round2(unitPrice * i.quantity),
    };
  });

  return { items, count: items.length, ...computeTotals(items) };
};

const parseQuantity = (value) => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const q = Number(value);
  return Number.isFinite(q) && q >= 0.001 && q <= MAX_QTY && Math.abs(q * 1000 - Math.round(q * 1000)) < 1e-8 ? q : null;
};

export const getCart = async (req, res) => {
  try {
    res.json({ success: true, cart: await buildCartResponse(await getCartDoc(req.user._id)) });
  } catch (error) {
    if (error.name === "VersionError" || error.code === 11000) return fail(res, 409, "السلة اتغيرت، حاول مرة أخرى");
    serverError(res, error, "getCart");
  }
};

// إضافة منتج: لو موجود بنزود على كميته
export const addToCart = async (req, res) => {
  try {
    const { productId } = req.body;
    const quantity = parseQuantity(req.body.quantity ?? 1);
    if (!isValidId(productId)) return fail(res, 404, "المنتج غير موجود");
    if (!quantity) return fail(res, 400, "الكمية غير صحيحة");

    const product = await Product.findOne({ _id: productId, isActive: { $ne: false } });
    if (!product) return fail(res, 404, "المنتج غير موجود");
    if (product.stock < quantity) return fail(res, 400, "المنتج غير متوفر حالياً");

    const cart = await getCartDoc(req.user._id);
    const existing = cart.items.find((i) => String(i.product) === String(product._id));
    const nextQty = Math.min(Math.round(((existing?.quantity || 0) + quantity) * 1000) / 1000, MAX_QTY);

    if (nextQty > product.stock) {
      return fail(res, 400, `المتاح من "${product.name}" ${product.stock} ${product.unit || ""} فقط`);
    }

    if (existing) existing.quantity = nextQty;
    else cart.items.push({ product: product._id, quantity: nextQty });
    await cart.save();

    res.status(201).json({
      success: true,
      message: "تمت الإضافة إلى السلة",
      cart: await buildCartResponse(cart),
    });
  } catch (error) {
    if (error.name === "VersionError" || error.code === 11000) return fail(res, 409, "السلة اتغيرت، حاول مرة أخرى");
    serverError(res, error, "addToCart");
  }
};

// تعديل الكمية (بتتحط كما هي، مش بتتجمع)
export const updateCartItem = async (req, res) => {
  try {
    const { productId } = req.params;
    const quantity = parseQuantity(req.body.quantity);
    if (!quantity) return fail(res, 400, "الكمية غير صحيحة");

    const cart = await getCartDoc(req.user._id);
    const item = cart.items.find((i) => String(i.product) === String(productId));
    if (!item) return fail(res, 404, "المنتج غير موجود في السلة");

    const product = await Product.findOne({ _id: productId, isActive: { $ne: false } });
    if (!product) return fail(res, 404, "المنتج غير متاح");
    if (quantity > product.stock) {
      return fail(res, 400, `المتاح من "${product.name}" ${product.stock} ${product.unit || ""} فقط`);
    }

    item.quantity = quantity;
    await cart.save();
    res.json({ success: true, cart: await buildCartResponse(cart) });
  } catch (error) {
    if (error.name === "VersionError" || error.code === 11000) return fail(res, 409, "السلة اتغيرت، حاول مرة أخرى");
    serverError(res, error, "updateCartItem");
  }
};

export const removeFromCart = async (req, res) => {
  try {
    const cart = await getCartDoc(req.user._id);
    cart.items = cart.items.filter((i) => String(i.product) !== String(req.params.productId));
    await cart.save();
    res.json({ success: true, cart: await buildCartResponse(cart) });
  } catch (error) {
    if (error.name === "VersionError" || error.code === 11000) return fail(res, 409, "السلة اتغيرت، حاول مرة أخرى");
    serverError(res, error, "removeFromCart");
  }
};

export const clearCart = async (req, res) => {
  try {
    const cart = await getCartDoc(req.user._id);
    cart.items = [];
    await cart.save();
    res.json({ success: true, cart: await buildCartResponse(cart) });
  } catch (error) {
    if (error.name === "VersionError" || error.code === 11000) return fail(res, 409, "السلة اتغيرت، حاول مرة أخرى");
    serverError(res, error, "clearCart");
  }
};

 // Merge guest quantities by maximum rather than addition so retries are idempotent.
export const mergeGuestCart = async (req,res) => {
 try {
  const lines=req.body?.items;
  if(!Array.isArray(lines)||lines.length>100) return fail(res,400,"Invalid guest cart");
  const requested=new Map();
  for(const line of lines){
   const quantity=parseQuantity(line?.quantity);
   if(typeof line?.productId!=="string"||!isValidId(line.productId)||quantity===null) return fail(res,400,"Invalid cart item");
   const id=line.productId.toLowerCase();
   requested.set(id,Math.max(requested.get(id)||0,quantity));
  }
  const cart=await getCartDoc(req.user._id);
  const products=await Product.find({_id:{$in:[...requested.keys()]},isActive:{$ne:false}});
  const byId=new Map(products.map(p=>[String(p._id),p]));
  const adjustments=[];
  for(const [id,quantity] of requested){
   const product=byId.get(id);
   if(!product){adjustments.push({productId:id,reason:"unavailable"});continue;}
   const existing=cart.items.find(i=>String(i.product)===id);
   const desired=Math.max(existing?.quantity||0,quantity);
   const accepted=Math.floor(Math.min(desired,product.stock,MAX_QTY)*1000+1e-8)/1000;
   if(accepted<desired)adjustments.push({productId:id,reason:"stock",quantity:accepted});
   if(accepted<0.001){cart.items=cart.items.filter(i=>String(i.product)!==id);continue;}
   if(existing)existing.quantity=accepted;else cart.items.push({product:product._id,quantity:accepted});
  }
  await cart.save();
  res.json({success:true,cart:await buildCartResponse(cart),adjustments});
 }catch(error){
  if(error.name==="VersionError"||error.code===11000)return fail(res,409,"السلة اتغيرت، حاول مرة أخرى");
  serverError(res,error,"mergeGuestCart");
 }
};
