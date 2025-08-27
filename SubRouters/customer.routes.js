import express from "express";
import CustomerController from "../Controllers/CustomerControllers/CustomerController.js";
import jwtAuth from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/fileUpload.middleware.js";
import { walletQRUpload } from "../middlewares/walletQRUpload.middleware.js";

const customerRouter = express.Router();

const customerController = new CustomerController();

customerRouter.get("/", (req, res) => {
  customerController.home(req, res);
});

customerRouter.get("/check-auth", jwtAuth, (req, res) => {
  customerController.checkAuth(req, res);
});

customerRouter.post("/signup", (req, res) => {
  customerController.signUp(req, res);
});
customerRouter.post("/verify-account", (req, res) => {
  customerController.verifyAccount(req, res);
});
customerRouter.post("/login", (req, res) => {
  customerController.logIn(req, res);
});
customerRouter.post("/reset-password", (req, res) => {
  customerController.resetPassword(req, res);
});

customerRouter.post("/change-password", jwtAuth, (req, res) => {
  customerController.changePassword(req, res);
});

customerRouter.post("/deposit", jwtAuth, (req, res) => {
  customerController.depositMoney(req, res);
});

customerRouter.post(
  "/purchase-subscription",
  jwtAuth,
  upload.single("paymentScreenshot"),
  (req, res) => {
    customerController.purchaseSubscription(req, res);
  }
);

customerRouter.get("/get-customer-profile-data", jwtAuth, (req, res) => {
  customerController.getCustomerProfileData(req, res);
});

customerRouter.get("/get-profile-details", jwtAuth, (req, res) => {
  customerController.getProfileDetails(req, res);
});

customerRouter.post(
  "/update-bank-details",
  jwtAuth,
  walletQRUpload.single("walletQR"),
  (req, res) => {
    customerController.updateBankDetails(req, res);
  }
);

customerRouter.get("/get-referal-details", jwtAuth, (req, res) => {
  customerController.getReferalDetails(req, res);
});

customerRouter.get("/team-details", jwtAuth, (req, res) => {
  customerController.getTeamDetails(req, res);
});

customerRouter.post("/withdrawal-request", jwtAuth, (req, res) => {
  customerController.withdrawalRequest(req, res);
});

customerRouter.get("/get-withdrawal-requests", jwtAuth, (req, res) => {
  customerController.getUserWidhrawalRequest(req, res);
});

customerRouter.post("/transfer-money", jwtAuth, (req, res) => {
  customerController.transferMoney(req, res);
});

customerRouter.get("/get-senders-transfer-history", jwtAuth, (req, res) => {
  customerController.getSenderTransferHistory(req, res);
});

customerRouter.post("/transfer-money-to-main-wallet", jwtAuth, (req, res) => {
  customerController.transferMoneyToMainWallet(req, res);
});

customerRouter.post("/fetch-user-name", (req, res) => {
  customerController.fetchUserName(req, res);
});

customerRouter.get("/get-user-royalty-income-details", jwtAuth, (req, res) => {
  customerController.getUserRoyaltyIncomeDetails(req, res);
});

export default customerRouter;
