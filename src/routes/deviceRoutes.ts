import { Router } from "express";
import { DeviceController } from "../controllers/DeviceController";
import { requireCallerToken } from "../middleware/requireCallerToken";

const router = Router();
const deviceController = new DeviceController();

// The pod list is org-scoped by whoever asks, so there has to *be* a whoever. Without this the
// route answered an anonymous request with `DEVICE_API_TOKEN` — a superadmin credential on a
// real deployment — and returned every organization's fleet. See `requireCallerToken`.
router.get("/", requireCallerToken, deviceController.listDevices);

export default router;
