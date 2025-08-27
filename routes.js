import express from "express";
import adminRouter from "./SubRouters/admin.routes.js";
import customerRouter from "./SubRouters/customer.routes.js";

const router = express.Router();

router.use("/admin", adminRouter);
router.use("/customer", customerRouter);

export default router;
