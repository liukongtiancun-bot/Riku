import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sharingRouter from "./sharing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sharingRouter);

export default router;
