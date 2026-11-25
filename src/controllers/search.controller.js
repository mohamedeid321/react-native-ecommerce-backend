import Product from "../models/product.model.js";
import { buildSearchFilter } from "../utils/search.js";
import { serverError } from "../utils/http.js";

// GET /api/products/search?q=فراوله&category=fruits&page=1&limit=10
export const searchProducts = async (req, res) => {
  try {
    const filter = buildSearchFilter(req.query.q);
    if (!filter) return res.json({ success: true, query: "", products: [], hasMore: false });

    filter.isActive = { $ne: false };
    if (req.query.category && req.query.category !== "all") {
      filter.category = String(req.query.category);
    }

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 30);

    const products = await Product.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      success: true,
      query: String(req.query.q).trim(),
      products,
      hasMore: products.length === limit,
    });
  } catch (error) {
    serverError(res, error, "searchProducts");
  }
};
