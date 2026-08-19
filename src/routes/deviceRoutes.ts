import { Router } from "express";
import { DeviceController } from "../controllers/DeviceController";

const router = Router();
const deviceController = new DeviceController();

router.get("/", deviceController.listDevices);

export default router;
