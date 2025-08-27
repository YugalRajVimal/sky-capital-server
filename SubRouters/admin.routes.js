import express from "express";
import AdminController from "../Controllers/AdminControllers/AdminController.js";
import jwtAuth from "../middlewares/auth.middleware.js";
import { paymentQRUpload } from "../middlewares/paymentQR.middleware.js";

const adminRouter = express.Router();

const adminController = new AdminController();

adminRouter.get("/get-blocked-users", jwtAuth, (req, res) => {
  adminController.getBlockedUsers(req, res);
});

adminRouter.post("/unblock-user", jwtAuth, (req, res) => {
  adminController.unblockUser(req, res);
});

adminRouter.post("/toggle-site-maintenance", jwtAuth, (req, res) => {
  adminController.toggleSiteMaintenance(req, res);
});

adminRouter.get("/is-site-on-maintenance", (req, res) => {
  adminController.isSiteOnMaintenance(req, res);
});

adminRouter.get("/", (req, res) => {
  adminController.home(req, res);
});

adminRouter.post("/check-auth", jwtAuth, (req, res) => {
  adminController.checkAuth(req, res);
});

adminRouter.post("/login", (req, res) => {
  adminController.logIn(req, res);
});

adminRouter.post("/verify-account", (req, res) => {
  adminController.verifyAccount(req, res);
});

adminRouter.post("/reset-password", (req, res) => {
  adminController.resetPassword(req, res);
});

adminRouter.post("/change-password", jwtAuth, (req, res) => {
  adminController.changePassword(req, res);
});

// approveSubscription
adminRouter.post("/approve-subscription", jwtAuth, (req, res) => {
  adminController.approveSubscription(req, res);
});

adminRouter.get("/get-dashboard-details", jwtAuth, (req, res) => {
  adminController.getDashboardDetails(req, res);
});

adminRouter.get("/get-royalty-achievers", jwtAuth, (req, res) => {
  adminController.getRoyaltyAchieversList(req, res);
});

adminRouter.get("/get-all-users", jwtAuth, (req, res) => {
  adminController.getAllUsers(req, res);
});

adminRouter.get("/get-pending-subscription-request", jwtAuth, (req, res) => {
  adminController.getPendingSubscriptionRequest(req, res);
});

adminRouter.get("/get-pending-withdraw-request", jwtAuth, (req, res) => {
  adminController.getPendingWithdrawRequest(req, res);
});

adminRouter.post("/approve-pending-withdraw-request", jwtAuth, (req, res) => {
  adminController.approvePendingWithdrawRequest(req, res);
});

adminRouter.post(
  "/update-payment-details",
  jwtAuth,
  paymentQRUpload.single("walletQR"),
  (req, res) => {
    adminController.addPaymentDetails(req, res);
  }
);

adminRouter.get("/get-payment-details", jwtAuth, (req, res) => {
  adminController.getPaymentDetails(req, res);
});

adminRouter.get("/get-ten-days-company-turnover", jwtAuth, (req, res) => {
  adminController.getTenDaysCompanyTurnOver(req, res);
});

adminRouter.get("/get-royalty-achievers-main", jwtAuth, (req, res) => {
  adminController.getRoyaltyAchieversMain(req, res);
});

adminRouter.post("/pay-royalty-achiever", jwtAuth, (req, res) => {
  adminController.payRoyaltyAchiever(req, res);
});

adminRouter.get("/get-all-approved-subscriptions", jwtAuth, (req, res) => {
  adminController.getAllApprovedSubscriptions(req, res);
});

adminRouter.delete(
  "/delete-approved-subscription/:subscriptionId",
  jwtAuth,
  (req, res) => {
    adminController.deleteApprovedSubscription(req, res);
  }
);

adminRouter.post("/add-notification", jwtAuth, (req, res) => {
  adminController.addNotification(req, res);
});

adminRouter.get("/get-notification", (req, res) => {
  adminController.getNotification(req, res);
});

adminRouter.delete("/delete-notification", jwtAuth, (req, res) => {
  adminController.deleteNotification(req, res);
});

export default adminRouter;
