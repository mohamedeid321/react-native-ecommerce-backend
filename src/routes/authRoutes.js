import express from "express";
import { signup, login } from "../controllers/auth.controller.js";
import { webRegister, webLogin, webRefresh, webLogout, webMe } from "../controllers/webAuth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
const router = express.Router();
router.post("/web/register", webRegister);
router.post("/web/login", webLogin);
router.post("/web/refresh", webRefresh);
router.post("/web/logout", webLogout);
router.get("/web/me", protectRoute, webMe);

router.post("/register", signup);

router.post("/login", login);

export default router;
