import {publicCache} from "../lib/publicCache.js";
import {createSingleFlight} from "../utils/singleFlight.js";
import Product from "../models/product.model.js";
import { buildSearchFilter } from "../utils/search.js";
import { serverError } from "../utils/http.js";

// GET /api/products/search?q=فراوله&category=fruits&page=1&limit=10
const searchFlight=createSingleFlight();
export const searchProducts = async (req, res) => {
  try {
    const query=typeof req.query.q==="string"?req.query.q.trim().slice(0,200):"";
    const filter = buildSearchFilter(query);
    if (!filter) return res.json({ success: true, query: "", products: [], hasMore: false });

    filter.isActive = { $ne: false };
    if (req.query.category && req.query.category !== "all") {
      filter.category = String(req.query.category);
    }

    const page = Math.min(10000,Math.max(parseInt(req.query.page) || 1, 1));
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 30);

    const key=JSON.stringify([query,filter.category??"all",page,limit]);
    const products = await searchFlight(key,()=>publicCache.read("search",key,5000,async()=> (await Product.find(filter).sort({createdAt:-1}).skip((page-1)*limit).limit(limit)).map(p=>p.toJSON())));

    res.json({
      success: true,
      query,
      products,
      hasMore: products.length === limit,
    });
  } catch (error) {
    serverError(res, error, "searchProducts");
  }
};
