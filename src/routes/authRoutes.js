import express from "express";
import { signup, login } from "../controllers/auth.controller.js";
import { webRegister, webLogin, webRefresh, webLogout, webMe, webLogoutAll, webCompleteProfile } from "../controllers/webAuth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { authRateLimit } from "../middleware/authRateLimit.js";
import { googleLogin } from "../controllers/googleAuth.controller.js";
const router = express.Router();
router.post("/web/google", authRateLimit("google",20), googleLogin);
router.post("/web/register", authRateLimit("/web/register", 10), webRegister);
router.post("/web/login", authRateLimit("/web/login", 20), webLogin);
router.post("/web/refresh", authRateLimit("/web/refresh", 60), webRefresh);
router.post("/web/logout", webLogout);
router.post("/web/logout-all", protectRoute, webLogoutAll);
router.post("/web/complete-profile", authRateLimit("profile",10), protectRoute, webCompleteProfile);
router.get("/web/me", protectRoute, webMe);

router.post("/register", authRateLimit("/register", 10), signup);

router.post("/login", authRateLimit("/login", 20), login);

export default router;
