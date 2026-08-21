import { Router } from "express";
import { ChatController } from "../controllers/ChatController";
import { quotaGuard } from "../middleware/quotaGuard";

const router = Router();
const chatController = new ChatController();

// The quota gate runs before the handler so an over-quota request is refused as a 429 with a
// JSON body, on the streaming path too — once `openSseStream` has written the status line the
// refusal could only be an in-band event on a 200. See `middleware/quotaGuard.ts`.
// A no-op unless `QUERY_QUOTA=true`.
router.post("/", quotaGuard(), chatController.postChat);

export default router;
