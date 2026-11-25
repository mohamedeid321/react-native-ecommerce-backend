import Wishlist from "../models/wishlist.model.js";
import Product from "../models/product.model.js";
import { fail, isValidId, serverError } from "../utils/http.js";

const getDoc = async (userId) =>
  (await Wishlist.findOne({ user: userId })) || new Wishlist({ user: userId, products: [] });

// ids (للقلب الأحمر) + المنتجات كاملة (لكروت الحساب)، الأحدث أولاً
const buildResponse = async (doc) => {
  const ids = doc.products.map(String).reverse();
  const found = ids.length ? await Product.find({ _id: { $in: ids }, isActive: { $ne: false } }) : [];
  const byId = new Map(found.map((p) => [String(p._id), p]));
  const products = ids.filter((id) => byId.has(id)).map((id) => byId.get(id));
  return { ids: products.map((p) => String(p._id)), products };
};

export const getWishlist = async (req, res) => {
  try {
    res.json({ success: true, ...(await buildResponse(await getDoc(req.user._id))) });
  } catch (error) {
    serverError(res, error, "getWishlist");
  }
};

export const addToWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!isValidId(productId) || !(await Product.findOne({ _id: productId, isActive: { $ne: false } }))) {
      return fail(res, 404, "المنتج غير موجود");
    }
    const doc = await getDoc(req.user._id);
    if (!doc.products.some((p) => String(p) === String(productId))) {
      doc.products.push(productId);
      await doc.save();
    }
    res.status(201).json({ success: true, ...(await buildResponse(doc)) });
  } catch (error) {
    serverError(res, error, "addToWishlist");
  }
};

export const removeFromWishlist = async (req, res) => {
  try {
    const doc = await getDoc(req.user._id);
    doc.products = doc.products.filter((p) => String(p) !== String(req.params.productId));
    await doc.save();
    res.json({ success: true, ...(await buildResponse(doc)) });
  } catch (error) {
    serverError(res, error, "removeFromWishlist");
  }
};
