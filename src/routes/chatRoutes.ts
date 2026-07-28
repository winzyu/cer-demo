import { Router } from "express";
import { ChatController } from "../controllers/ChatController";

const router = Router();
const chatController = new ChatController();

router.post("/", chatController.postChat);

export default router;
