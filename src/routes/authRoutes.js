import {updateCustomerPhoto} from '../controllers/customerPhoto.controller.js';
import express from "express";
import { signup, login } from "../controllers/auth.controller.js";
import { webRegister, webLogin, webRefresh, webLogout, webMe, webLogoutAll, webCompleteProfile } from "../controllers/webAuth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { authRateLimit } from "../middleware/authRateLimit.js";
import { googleLogin, linkGoogle } from "../controllers/googleAuth.controller.js";
import { enrollAdminMfa, confirmAdminMfa } from "../controllers/adminMfa.controller.js";
const router = express.Router();
router.post("/web/admin/mfa/enroll", authRateLimit("mfa-enroll",5), enrollAdminMfa);
router.post("/web/admin/mfa/confirm", authRateLimit("mfa-confirm",10), confirmAdminMfa);
router.post("/web/google/link", authRateLimit("google-link",10), protectRoute, linkGoogle);
router.post("/web/google", authRateLimit("google",20), googleLogin);
router.post("/web/register", authRateLimit("/web/register", 10), webRegister);
router.post("/web/admin/login", authRateLimit("/web/admin/login", 20), (req,res)=>webLogin(req,res,true));
router.post("/web/login", authRateLimit("/web/login", 20), (req,res)=>webLogin(req,res,false));
router.post("/web/refresh", authRateLimit("/web/refresh", 60), webRefresh);
router.post("/web/logout", webLogout);
router.post("/web/logout-all", protectRoute, webLogoutAll);
router.post("/web/complete-profile", authRateLimit("profile",10), protectRoute, webCompleteProfile);
router.patch("/web/profile/photo",protectRoute,authRateLimit("customer-photo",20),updateCustomerPhoto);
router.get("/web/me", protectRoute, webMe);

router.post("/register", authRateLimit("/register", 10), signup);

router.post("/login", authRateLimit("/login", 20), login);

export default router;
