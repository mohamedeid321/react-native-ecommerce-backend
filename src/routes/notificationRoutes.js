import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  registerToken,
  removeToken,
  getNotifications,
  markAllRead,
  markOneRead,
} from "../controllers/notification.controller.js";

const router = express.Router();
router.use(protectRoute);

router.get("/", getNotifications);
router.post("/token", registerToken); // { token, platform }
router.post("/token/remove", removeToken); // { token }
router.post("/read-all", markAllRead);
router.post("/:id/read", markOneRead);

export default router;
