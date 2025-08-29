import sendMail from "../../config/nodeMailer.config.js";
import { deleteUploadedFile } from "../../middlewares/fileDelete.middleware.js";
import AdminModel from "../../schemas/admin.schema.js";
import PendingSubcriptionModel from "../../schemas/pendingSubscription.schema.js";
import UserModel from "../../schemas/user.schema.js";
import cron from "node-cron";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import WidhrawalRequestModel from "../../schemas/widhrawalRequest.schema.js";
import RoyaltyPaidHistoryModel from "../../schemas/royaltyPaidHistory.schema.js";
import ApprovedSubcriptionModel from "../../schemas/approvedSubscription.schema.js";
import mongoose from "mongoose";
import path, { parse } from "path";

import { fileURLToPath } from "url";
import { dirname } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const activeCronJobs = {}; // to store running jobs and prevent duplication

const levelIncome = [0.05, 0.03, 0.02];

const cronJobLevels = [
  {
    jobLevel: 0,
    worldUsersRequired: 25,
    referredUsersRequired: 1,
    rewardPerDay: 0.25,
    totalDays: 60,
  },
  {
    jobLevel: 1,
    worldUsersRequired: 145,
    referredUsersRequired: 3,
    rewardPerDay: 0.4,
    totalDays: 60,
  },
  {
    jobLevel: 2,
    worldUsersRequired: 495,
    referredUsersRequired: 7,
    rewardPerDay: 0.8,
    totalDays: 60,
  },
  {
    jobLevel: 3,
    worldUsersRequired: 1520,
    referredUsersRequired: 11,
    rewardPerDay: 1,
    totalDays: 60,
  },
  {
    jobLevel: 4,
    worldUsersRequired: 2970,
    referredUsersRequired: 15,
    rewardPerDay: 2,
    totalDays: 60,
  },
  {
    jobLevel: 5,
    worldUsersRequired: 5045,
    referredUsersRequired: 19,
    rewardPerDay: 3,
    totalDays: 60,
  },
  {
    jobLevel: 6,
    worldUsersRequired: 8595,
    referredUsersRequired: 23,
    rewardPerDay: 5,
    totalDays: 60,
  },
  {
    jobLevel: 7,
    worldUsersRequired: 14445,
    referredUsersRequired: 27,
    rewardPerDay: 8,
    totalDays: 60,
  },
  {
    jobLevel: 8,
    worldUsersRequired: 24445,
    referredUsersRequired: 31,
    rewardPerDay: 12,
    totalDays: 60,
  },
  {
    jobLevel: 9,
    worldUsersRequired: 44445,
    referredUsersRequired: 35,
    rewardPerDay: 15,
    totalDays: 60,
  },
];

const rewardTeamBusinessAmount = [
  { level: 0, businessAmount: 5000, reward: 100 },
  { level: 1, businessAmount: 10000, reward: 200 },
  { level: 2, businessAmount: 20000, reward: 300 },
  { level: 3, businessAmount: 40000, reward: 500 },
  { level: 4, businessAmount: 70000, reward: 700 },
  { level: 5, businessAmount: 100000, reward: 1000 },
  { level: 6, businessAmount: 200000, reward: 2000 },
  { level: 7, businessAmount: 500000, reward: 5000 },
  { level: 8, businessAmount: 1000000, reward: 10000 },
  { level: 9, businessAmount: 2500000, reward: 20000 },
];

class AdminController {
  unblockUser = async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }
      const user = await UserModel.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      user.accountBlocked = false;
      await user.save();
      return res.status(200).json({ message: "User unblocked successfully" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getBlockedUsers = async (req, res) => {
    try {
      const blockedUsers = await UserModel.find({ accountBlocked: true });
      return res.status(200).json(blockedUsers);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  toggleSiteMaintenance = async (req, res) => {
    try {
      const admin = await AdminModel.findOne({});
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }
      admin.isSiteOnMaintenance = !admin.isSiteOnMaintenance;
      await admin.save();
      return res.status(200).json({
        message: `Site maintenance mode has been ${
          admin.isSiteOnMaintenance ? "enabled" : "disabled"
        }`,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  isSiteOnMaintenance = async (req, res) => {
    try {
      const admin = await AdminModel.findOne({});
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }
      return res
        .status(200)
        .json({ isSiteOnMaintenance: admin.isSiteOnMaintenance });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  isSiteOnMaintenanceServer = async () => {
    try {
      const admin = await AdminModel.findOne({});
      if (!admin) {
        console.log("Admin not found");
        return true;
      }
      return admin.isSiteOnMaintenance;
    } catch (error) {
      console.error(error);
    }
  };

  getISTMidnightISOString(inputDateStr) {
    const date = new Date(inputDateStr);
    const utcTime = date.getTime();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST offset in milliseconds
    const istDate = new Date(utcTime + istOffset);

    istDate.setHours(0, 0, 0, 0); // Set to 00:00:00 IST

    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, "0");
    const dd = String(istDate.getDate()).padStart(2, "0");

    return `${yyyy}-${mm}-${dd}T00:00:00.000+05:30`;
  }

  getISTEndOfDayISOString(inputDateStr) {
    const date = new Date(inputDateStr);
    const utcTime = date.getTime();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(utcTime + istOffset);

    istDate.setHours(23, 59, 59, 999); // Set to 23:59:59.999 IST

    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, "0");
    const dd = String(istDate.getDate()).padStart(2, "0");

    return `${yyyy}-${mm}-${dd}T23:59:59.999+05:30`;
  }

  checkAuth = async (req, res) => {
    const role = req.user.role;
    if (role != "Admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }

    return res.status(200).json({ message: "Authorized" });
  };

  getTenDaysCompanyTurnOver = async (req, res) => {
    try {
      const { fromDate, toDate } = req.query;

      if (!fromDate || !toDate) {
        return res
          .status(400)
          .json({ message: "fromDate and toDate are required" });
      }

      const admin = await AdminModel.findOne({});
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }

      // Normalize fromDate and toDate (strip time)
      const from = new Date(new Date(fromDate).toISOString().slice(0, 10));
      const to = new Date(new Date(toDate).toISOString().slice(0, 10));

      const companyTurnoverByDate = admin.companyTurnoverByDate.filter(
        (entry) => {
          const entryDate = new Date(
            new Date(entry.date).toISOString().slice(0, 10)
          );
          return entryDate >= from && entryDate <= to;
        }
      );

      const totalTurnover = companyTurnoverByDate.reduce(
        (acc, curr) => acc + curr.amount,
        0
      );

      res.status(200).json({ totalTurnover });
    } catch (error) {
      console.error("Error in getTenDaysCompanyTurnOver:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getThisTenDaysCompanyTurnOver = async (fromDate, toDate) => {
    try {
      if (!fromDate || !toDate) {
        return res
          .status(400)
          .json({ message: "fromDate and toDate are required" });
      }

      const admin = await AdminModel.findOne({});
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }

      // Normalize fromDate and toDate (strip time)
      const from = new Date(new Date(fromDate).toISOString().slice(0, 10));
      const to = new Date(new Date(toDate).toISOString().slice(0, 10));

      const companyTurnoverByDate = admin.companyTurnoverByDate.filter(
        (entry) => {
          const entryDate = new Date(
            new Date(entry.date).toISOString().slice(0, 10)
          );
          return entryDate >= from && entryDate <= to;
        }
      );

      const totalTurnover = companyTurnoverByDate.reduce(
        (acc, curr) => acc + curr.amount,
        0
      );

      return totalTurnover;
    } catch (error) {
      console.error("Error in getTenDaysCompanyTurnOver:", error);
      return;
    }
  };

  getRoyaltyAchieversMain = async (req, res) => {
    try {
      const { fromDate, toDate } = req.query;

      if (!fromDate || !toDate) {
        console.log("Missing fromDate or toDate in query parameters.");
        return res
          .status(400)
          .json({ message: "fromDate and toDate are required." });
      }

      const from = this.getISTMidnightISOString(fromDate);
      const to = this.getISTEndOfDayISOString(toDate);

      // new Date();
      // from.setHours(0, 0, 0, 0); // start of day

      // const to = new Date(toDate);
      // to.setHours(23, 59, 59, 999); // end of day

      const tenDaysTurnOver = await this.getThisTenDaysCompanyTurnOver(
        from,
        to
      );
      console.log(tenDaysTurnOver);

      const royaltyAchievers = await RoyaltyPaidHistoryModel.find({
        dateFrom: { $gte: from },
        dateTo: { $lte: to },
      }).populate(
        "userId",
        "_id name email phoneNo sponsorId status bankId idType"
      );

      console.log(
        "Fetched royalty achievers for the given date range.",
        royaltyAchievers
      );

      // Step 1: Group by userId
      const groupedByUser = new Map();

      royaltyAchievers.forEach((entry) => {
        const id = entry?.userId?._id?.toString();
        if (!groupedByUser?.has(id)) {
          groupedByUser?.set(id, []);
        }
        groupedByUser?.get(id)?.push(entry);
      });

      console.log("Grouped royalty achievers by userId.", groupedByUser);

      // Step 2: Apply logic to pick entries
      const filteredRoyaltyAchievers = [];

      for (const [userId, entries] of groupedByUser.entries()) {
        const hasTenDays = entries.some((e) => e.royaltyType === "tenDays");

        if (hasTenDays) {
          // Include only 'tenDays' type entries
          filteredRoyaltyAchievers.push(
            ...entries.filter((e) => e.royaltyType === "tenDays")
          );
        } else {
          // Include all (likely 'week' type) if no 'tenDays' exists
          filteredRoyaltyAchievers.push(...entries);
        }
      }

      console.log(
        "Filtered royalty achievers based on the logic.",
        filteredRoyaltyAchievers
      );

      return res.status(200).json({ filteredRoyaltyAchievers });
    } catch (error) {
      console.error("Error in getRoyaltyAchieversMain:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  payRoyaltyAchiever = async (req, res) => {
    try {
      const { userId, reward } = req.body;
      if (!userId || !reward) {
        return res
          .status(400)
          .json({ message: "userId and reward are required." });
      }

      const royaltyPaidHistory = await RoyaltyPaidHistoryModel.findById(userId);
      if (!royaltyPaidHistory) {
        return res
          .status(404)
          .json({ message: "Royalty Paid History not found." });
      }

      royaltyPaidHistory.royaltyReward = reward;
      royaltyPaidHistory.status = "paid";
      await royaltyPaidHistory.save();

      return res.status(200).json({ message: "Royalty paid successfully." });
    } catch (error) {
      console.error("Error in payRoyaltyAchiever:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  verifyAccount = async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }
    try {
      const admin = await AdminModel.findOne({ email });
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }
      if (admin.otp !== otp) {
        return res.status(401).json({ message: "Invalid OTP" });
      }
      admin.otp = null;
      admin.save();
      // Verify the admin and update the verified field to true
      await AdminModel.findByIdAndUpdate(
        admin.id,
        { verified: true },
        { new: true }
      );
      // Generate a JSON Web Token
      const token = jwt.sign(
        { id: admin.id, email: admin.email, role: "Admin" },
        process.env.JWT_SECRET
      );
      res.status(200).json({ message: "Account verified successfully", token });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  logIn = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }
    try {
      const admin = await AdminModel.findOne({ email });
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }
      if (!admin.verified) {
        const otp = Math.floor(Math.random() * 900000) + 100000;
        // Save OTP to the admin document
        await AdminModel.findByIdAndUpdate(admin.id, { otp }, { new: true });
        const message = `Your OTP is: ${otp}`;
        await sendMail(email, "Sign Up OTP", message);
        return res.status(403).json({
          message: "Admin not verified. OTP sent to your email. Verify Account",
        });
      }
      const isMatch = await bcrypt.compare(password, admin.password);
      if (!isMatch) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      // Generate a JSON Web Token
      const token = jwt.sign(
        { id: admin.id, email: admin.email, role: "Admin" },
        process.env.JWT_SECRET
      );
      res.status(200).json({ token });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  resetPassword = async (req, res) => {
    const { email, newPassword } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    try {
      const admin = await AdminModel.findOne({ email });
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }
      // Encrypt the new password
      const encryptedPassword = await bcrypt.hash(newPassword, 10);
      // Update the admin document with the new password and set verified to false
      // Generate OTP
      const otp = Math.floor(Math.random() * 900000) + 100000;

      await AdminModel.findByIdAndUpdate(
        admin.id,
        { otp, password: encryptedPassword, verified: false },
        { new: true }
      );
      // Send OTP to the admin's email
      const message = `Your OTP is: ${otp}`;
      await sendMail(email, "Reset Password OTP", message);
      return res.status(200).json({
        message: "OTP sent to your Email, Verify yourself to reset Password.",
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  changePassword = async (req, res) => {
    const role = req.user.role;
    if (role != "Admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "Old and new passwords are required" });
    }
    try {
      const admin = await AdminModel.findById(req.user.id);
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }
      const isMatch = await bcrypt.compare(oldPassword, admin.password);
      if (!isMatch) {
        return res.status(401).json({ message: "Old password is incorrect" });
      }
      const encryptedPassword = await bcrypt.hash(newPassword, 10);
      await AdminModel.findByIdAndUpdate(
        admin.id,
        { password: encryptedPassword },
        { new: true }
      );
      return res.status(200).json({ message: "Password changed successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  home = async (req, res) => {
    res.send("Hello Admin");
  };

  getDashboardDetails = async (req, res) => {
    if (req.user.role !== "Admin") {
      return res.status(401).json({ message: "---- Unauthorized" });
    }

    try {
      const admin = await AdminModel.findById(req.user.id);
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }

      const totalUsers = await UserModel.countDocuments();
      const totalSubscribedUsers = await UserModel.countDocuments({
        subscribed: true,
      });

      const dashboardDetails = {
        Name: admin.name,
        Email: admin.email,
        subscriptionAmount: admin.subscriptionAmount,
        CompanyTurnOver: admin.companyTurnover,
        WeekRoyaltyAchieverCount: admin.weekRoyaltyAchiever.length,
        TenDaysRoyaltyAchieverCount: admin.tenDaysRoyaltyAchiever.length,
        totalUsers,
        totalSubscribedUsers,
      };

      return res.status(200).json(dashboardDetails);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getRoyaltyAchieversList = async (req, res) => {
    if (req.user.role !== "Admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const admin = await AdminModel.findById(req.user.id)
        .populate({
          path: "weekRoyaltyAchiever.userId",
          model: "User",
          select: "name email phoneNo referalId sponsorId subscribed", // add fields you want
        })
        .populate({
          path: "tenDaysRoyaltyAchiever.userId",
          model: "User",
          select: "name email phoneNo referalId sponsorId subscribed", // add fields you want
        });

      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }

      const royaltyAchievers = {
        WeekRoyaltyAchiever: admin.weekRoyaltyAchiever,
        TenDaysRoyaltyAchiever: admin.tenDaysRoyaltyAchiever,
      };

      return res.status(200).json(royaltyAchievers);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getAllUsers = async (req, res) => {
    if (req.user.role !== "Admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const admin = await AdminModel.findById(req.user.id);
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }

      const users = await UserModel.find({}, "-password");

      return res.status(200).json(users);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getPendingSubscriptionRequest = async (req, res) => {
    if (req.user.role !== "Admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      // const requests = await PendingSubcriptionModel.find({});
      const requests = await PendingSubcriptionModel.find({}).populate({
        path: "userId",
        select: "name email phoneNo _id hashString amount",
      });

      const pendingRequests = requests.map((request) => ({
        ...request.toObject(), // Ensures plain object (not Mongoose doc)
        screenshotPath: `http://${process.env.DOMAIN}/uploads/payments/${request.screenshotPath}`,
      }));

      return res.status(200).json(pendingRequests);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getPendingWithdrawRequest = async (req, res) => {
    if (req.user.role !== "Admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const pendingRequests = await WidhrawalRequestModel.find({
        status: "pending",
      }).populate({
        path: "userId",
        select: "name email phoneNo _id",
      });

      return res.status(200).json(pendingRequests);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  approvePendingWithdrawRequest = async (req, res) => {
    if (req.user.role !== "Admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { requestId, statusPerform } = req.body;

    console.log(statusPerform);

    if (statusPerform != "approve" && statusPerform != "reject") {
      return res.status(400).json({
        message: "Invalid statusPerform value. Expected 'approve' or 'reject'.",
      });
    }

    try {
      const request = await WidhrawalRequestModel.findById(requestId);
      if (!request) {
        return res.status(404).json({ message: "Request not found" });
      }

      if (request.status == "rejected") {
        return res.status(400).json({ message: "Request already rejected" });
      }

      if (request.status == "approved") {
        return res.status(400).json({ message: "Request already approved" });
      }

      if (statusPerform == "reject") {
        request.status = "rejected";
        await request.save();
        return res
          .status(200)
          .json({ message: "Request rejected successfully" });
      }

      const user = await UserModel.findById(request.userId);

      if (user.mainWalletBalance < request.requestAmount) {
        return res.status(400).json({ message: "Insufficient wallet balance" });
      }

      user.mainWalletBalance -= request.requestAmount;
      user.totalWithdrawalAmount =
        parseFloat(user.totalWithdrawalAmount) +
        parseFloat(request.requestAmount);
      await user.save();

      request.status = "approved";
      await request.save();

      return res.status(200).json({ message: "Request approved successfully" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  generateUniqueReferalCode = async () => {
    let uniqueCode = "FTR";
    let isUnique = false;
    let code;

    while (!isUnique) {
      code = uniqueCode + Math.floor(Math.random() * 900000);
      const existingUser = await UserModel.findOne({ referalId: code });
      if (!existingUser) {
        isUnique = true;
      }
    }

    return code;
  };

  rewardUser = async (referrer, jobLevel, rewardPerDay) => {
    const today = new Date().toISOString().split("T")[0];

    // ✅ Initialize if undefined
    if (!referrer.dailyCronJobIncomeLog) {
      referrer.dailyCronJobIncomeLog = {};
    }

    const logsToday = referrer.dailyCronJobIncomeLog[today] || [];

    // Check if the user has already been rewarded for the given job level today
    const alreadyRewarded = logsToday.some((log) => log.jobLevel === jobLevel);
    if (alreadyRewarded) {
      console.log(`User already rewarded for job level ${jobLevel} today.`);
      return;
    }

    // ✅ Push today's log
    logsToday.push({
      amount: rewardPerDay,
      jobLevel,
      date: new Date(),
    });

    // ✅ Assign updated logs back
    referrer.dailyCronJobIncomeLog[today] = logsToday;

    // ✅ Mark modified fields for Mongoose
    referrer.markModified("dailyCronJobIncomeLog");

    // Initialize cronJobByLevelIncome
    if (!referrer.cronJobByLevelIncome) {
      referrer.cronJobByLevelIncome = {};
    }

    if (!referrer.cronJobByLevelIncome[jobLevel]) {
      referrer.cronJobByLevelIncome[jobLevel] = 0;
    }

    // ✅ Balance & progress update
    referrer.walletBalance =
      parseFloat(referrer.walletBalance) + parseFloat(rewardPerDay);
    referrer.totalEarning =
      parseFloat(referrer.totalEarning) + parseFloat(rewardPerDay);
    referrer.subscriptionWalletBalance =
      parseFloat(referrer.subscriptionWalletBalance) + parseFloat(rewardPerDay);

    referrer.cronJobByLevelIncome[jobLevel] =
      Number(referrer.cronJobByLevelIncome[jobLevel]) + rewardPerDay;

    if (referrer.subscriptionWalletBalance >= 18) {
      referrer.walletBalance -= 6;
      referrer.subscriptionWalletBalance -= 18;
      referrer.subscriptionWidhrawBalance = 0;

      referrer.subscriptionHistory.push({
        date: new Date(),
        amount: 6,
      });

      console.log(
        "Subscription is over, resetting subscriptionWalletBalance and subscriptionWidhrawBalance."
      );
    }

    if (!referrer.cronJobProgress) {
      referrer.cronJobProgress = {};
    }

    if (!referrer.cronJobProgress[jobLevel]) {
      referrer.cronJobProgress[jobLevel] = 0;
    }

    referrer.cronJobProgress[jobLevel] = referrer.cronJobProgress[jobLevel] + 1;

    // ✅ Mark modified fields for Mongoose
    referrer.markModified("cronJobByLevelIncome");
    referrer.markModified("cronJobProgress");

    await referrer.save();
    console.log(
      `Reward of ${rewardPerDay} for job level ${jobLevel} successfully processed.`
    );
  };

  pendingRewardUser = async (
    referrer,
    jobLevel,
    rewardPerDay,
    idx,
    startedDate
  ) => {
    const today = new Date(startedDate);
    today.setFullYear(
      startedDate.getFullYear(),
      startedDate.getMonth(),
      startedDate.getDate() + idx
    );
    const formattedDate = today.toISOString().split("T")[0];

    // ✅ Initialize if undefined
    if (!referrer.dailyCronJobIncomeLog) {
      referrer.dailyCronJobIncomeLog = {};
    }

    const logsToday = referrer.dailyCronJobIncomeLog[formattedDate] || [];

    const alreadyRewarded = logsToday.some((log) => log.jobLevel === jobLevel);
    if (alreadyRewarded) {
      console.log(
        `User already rewarded for job level ${jobLevel} on ${formattedDate}.`
      );
      return;
    }

    // ✅ Push today's log
    logsToday.push({
      amount: rewardPerDay,
      jobLevel,
      date: new Date(),
    });

    // ✅ Assign updated logs back
    referrer.dailyCronJobIncomeLog[formattedDate] = logsToday;

    // ✅ Mark modified fields for Mongoose
    referrer.markModified("dailyCronJobIncomeLog");

    // Initialize cronJobByLevelIncome
    if (!referrer.cronJobByLevelIncome) {
      referrer.cronJobByLevelIncome = {};
    }

    if (!referrer.cronJobByLevelIncome[jobLevel]) {
      referrer.cronJobByLevelIncome[jobLevel] = 0;
    }

    // ✅ Balance & progress update
    referrer.walletBalance =
      parseFloat(referrer.walletBalance) + parseFloat(rewardPerDay);

    referrer.totalEarning =
      parseFloat(referrer.totalEarning) + parseFloat(rewardPerDay);

    referrer.subscriptionWalletBalance =
      parseFloat(referrer.subscriptionWalletBalance) + parseFloat(rewardPerDay);
    referrer.cronJobByLevelIncome[jobLevel] =
      Number(referrer.cronJobByLevelIncome[jobLevel]) + rewardPerDay;

    if (!referrer.cronJobProgress) {
      referrer.cronJobProgress = {};
    }

    if (!referrer.cronJobProgress[jobLevel]) {
      referrer.cronJobProgress[jobLevel] = 0;
    }

    referrer.cronJobProgress[jobLevel] = referrer.cronJobProgress[jobLevel] + 1;

    // ✅ Mark modified fields for Mongoose
    referrer.markModified("cronJobByLevelIncome");
    referrer.markModified("cronJobProgress");

    await referrer.save();
    console.log(
      `Pending reward of ${rewardPerDay} for job level ${jobLevel} successfully processed.`
    );
  };

  startDailyCronForReferrer = async (
    referrerId,
    jobLevel,
    rewardPerDay,
    totalDays
  ) => {
    const jobKey = `${referrerId}_${jobLevel}`;

    // Check if a cron job for the given referrer and job level is already running
    if (activeCronJobs[jobKey]) {
      console.log(`Cron job for ${jobKey} already running`);
      return;
    }

    // Retrieve the referrer user document
    const user = await UserModel.findById(referrerId);
    if (!user) return; // Exit if the user is not found

    // Calculate the start date of the cron job
    const startedOn = new Date(user.cronJobByLevelStartedOn?.[jobLevel]);
    const today = new Date();
    const diffInDays = Math.floor((today - startedOn) / (1000 * 60 * 60 * 24));

    // Calculate the number of rewarded days
    const rewardedDays = user.cronJobProgress?.[jobLevel] || 0;
    // Calculate the number of missed days
    const missedDays = Math.min(
      diffInDays - rewardedDays,
      totalDays - rewardedDays
    );

    // Reward any missed days immediately
    for (let i = 0; i < missedDays; i++) {
      await this.rewardUser(user, jobLevel, rewardPerDay);
      console.log(`Rewarding missed day ${i + 1} for job level ${jobLevel}`);
    }

    let dayCount = rewardedDays + missedDays;

    // Daily cron runs at midnight
    const task = cron.schedule("0 0 * * *", async () => {
      try {
        // Retrieve the referrer user document for each cron task
        const referrer = await UserModel.findById(referrerId);
        if (!referrer) {
          console.log(`User not found: ${referrerId}`);
          task.stop(); // Stop the task if the user is not found
          delete activeCronJobs[jobKey]; // Remove the task from the active jobs
          return;
        }

        // Retrieve the progress of the referrer for the given job level
        const progress = referrer.cronJobProgress?.[jobLevel] || 0;

        // Check if the progress has reached the total days
        if (progress >= totalDays) {
          task.stop(); // Stop the task if the progress has reached the total days
          delete activeCronJobs[jobKey]; // Remove the task from the active jobs
          console.log(
            `Cron job completed for ${referrer.name} (Level ${jobLevel})`
          );
          return;
        }

        // Reward the user for the current day
        await this.rewardUser(referrer, jobLevel, rewardPerDay);
        dayCount++; // Increment the day count

        // Check if the day count has reached the total days
        if (dayCount >= totalDays) {
          task.stop(); // Stop the task if the day count has reached the total days
          delete activeCronJobs[jobKey]; // Remove the task from the active jobs
          console.log(
            `Cron job completed for ${referrer.name} (Level ${jobLevel})`
          );
        }
      } catch (err) {
        console.error("Error in cron task:", err);
        task.stop(); // Stop the task if an error occurs
        delete activeCronJobs[jobKey]; // Remove the task from the active jobs
      }
    });

    task.start(); // Start the task
    activeCronJobs[jobKey] = task; // Add the task to the active jobs
  };

  resumeCronJobs = async () => {
    const users = await UserModel.find({});

    for (const user of users) {
      for (const job of cronJobLevels) {
        const jobLevel = job.jobLevel;
        const totalDays = job.totalDays;
        const rewardPerDay = job.rewardPerDay;

        // Check if the job level has started for the user
        const startedDate = user.cronJobByLevelStartedOn?.[jobLevel];
        if (!startedDate) {
          console.log(
            `Job level ${jobLevel} has not started for user ${user.name}`
          );
          continue; // Skip if the job level has not started
        }

        // Check the progress of the user for the given job level
        const rewardedDays = user.cronJobProgress?.[jobLevel];
        if (rewardedDays >= totalDays) {
          console.log(
            `User ${user.name} has already completed job level ${jobLevel}`
          );
          continue; // Skip if the user has already completed the job level
        }

        const now = new Date();
        // Calculate the number of days elapsed since the job level started
        const elapsedDays = Math.floor(
          (now - new Date(startedDate)) / (1000 * 60 * 60 * 24)
        );

        // Calculate the number of days missed by the user
        const missedDays = Math.min(
          elapsedDays - rewardedDays,
          totalDays - rewardedDays
        );

        console.log(
          `Elapsed days since job level ${jobLevel} started for user ${user.name}: ${elapsedDays}`
        );
        console.log(
          `Days missed by user ${user.name} for job level ${jobLevel}: ${missedDays}`
        );

        // Reward the user for the missed days
        for (let i = 0; i < missedDays; i++) {
          await this.pendingRewardUser(
            user,
            jobLevel,
            rewardPerDay,
            i + 1,
            startedDate
          );
          console.log(
            `Rewarding missed day ${i + 1} for job level ${jobLevel} for user ${
              user.name
            }`
          );
        }

        // Calculate the remaining days for the job level
        const remainingDays = totalDays - (rewardedDays + missedDays);

        // Start a new cron job for the remaining days if necessary
        if (remainingDays > 0) {
          this.startDailyCronForReferrer(
            user._id,
            jobLevel,
            rewardPerDay,
            remainingDays
          );
          console.log(
            `Starting new cron job for user ${user.name} for job level ${jobLevel} with ${remainingDays} remaining days`
          );
        }
      }
    }
  };

  // Check if the referrer has reached the required number of world users and referred users for each job level
  startCronJobs = async (referrerId) => {
    const referrer = await UserModel.findById(referrerId);
    console.log(
      `Attempting to start cron jobs for referrer with ID: ${referrerId}`
    );

    console.log(`Starting cron jobs for referrer ${referrer.name}`);
    // Get the total number of subscribed users in the world
    const totalWorldUsers = await UserModel.countDocuments({
      subscribed: true,
    });

    console.log(`Total subscribed users in the world: ${totalWorldUsers}`);
    // Loop through each job level
    for (const job of cronJobLevels) {
      const { jobLevel, worldUsersRequired, referredUsersRequired } = job;
      console.log(
        `Checking job level ${jobLevel} for referrer ${referrer.name}`
      );

      // Calculate the difference in world users since the referrer subscribed
      const worldUserDelta =
        totalWorldUsers - referrer.worldUsersWhenSubscribed;
      console.log(
        `World user delta for referrer ${referrer.name}: ${worldUserDelta}`
      );

      // Get the referred users at level 0 (always level 0)
      const referredUsersAtLevel = referrer.referredUserByLevel["0"] || [];
      console.log(
        `Referred users at level 0 for referrer ${referrer.name}: ${referredUsersAtLevel.length}`
      );

      // Check if the referrer has reached the required number of world users and referred users for the current job level
      if (
        worldUserDelta >= worldUsersRequired &&
        referredUsersAtLevel.length >= referredUsersRequired &&
        !referrer.cronJobByLevelStarted[jobLevel]
      ) {
        console.log(
          `Conditions met for job level ${jobLevel} for referrer ${referrer.name}`
        );
        // If the conditions are met, mark the job level as started for the referrer
        referrer.cronJobByLevelStarted[jobLevel] = true;

        referrer.cronJobByLevelStartedOn[jobLevel] =
          this.getISTMidnightISOString(new Date());

        // Save the changes to the referrer document
        referrer.markModified("cronJobByLevelStarted");
        referrer.markModified("cronJobByLevelStartedOn");
        await referrer.save();
        console.log(
          `Saved changes for referrer ${referrer.name} at job level ${jobLevel}`
        );

        // Start the reward cron for the referrer
        await this.startDailyCronForReferrer(
          referrer._id,
          jobLevel,
          job.rewardPerDay,
          job.totalDays
        );
        console.log(
          `Started daily cron for referrer ${referrer.name} at job level ${jobLevel}`
        );

        // Log that the cron has been started for the referrer at the current job level
        console.log(
          `Started cron for user ${referrer.name} at level ${jobLevel}`
        );
      } else {
        console.log(
          `Conditions not met for job level ${jobLevel} for referrer ${referrer.name}`
        );
      }
    }
  };

  payLevelIncome = async (sponsorId, userId) => {
    let currentSponsorId = sponsorId;
    let level = 0;

    console.log(`Level income array length: ${levelIncome.length}`);

    const user = await UserModel.findById(userId);

    if (!user) {
      console.log(`User not found for userId: ${userId}`);
      return;
    }

    while (level < levelIncome.length && currentSponsorId) {
      console.log(`Current level: ${level}`);
      const referrer = await UserModel.findOne({ referalId: currentSponsorId });

      if (!referrer) {
        console.log(
          `Referrer not found for currentSponsorId: ${currentSponsorId}`
        );
        break;
      }

      console.log(`Referrer found for currentSponsorId: ${currentSponsorId}`);
      console.log(`UserId: ${userId}`);

      // Add income to the current referrer
      referrer.walletBalance =
        parseFloat(referrer.walletBalance) + parseFloat(levelIncome[level]);
      referrer.totalEarning =
        parseFloat(referrer.totalEarning) + parseFloat(levelIncome[level]);
      referrer.subscriptionWalletBalance =
        parseFloat(referrer.subscriptionWalletBalance) +
        parseFloat(levelIncome[level]);

      console.log(
        `Added level income to referrer's wallet and subscription wallet balance.`
      );

      if (
        !referrer.referredUserByLevel[level].some(
          (entry) => entry.userId === user._id
        )
      ) {
        const referredUserEntry = {
          userId: user._id,
          date: new Date(),
          reward: levelIncome[level],
        };

        if (!referrer.referredUserByLevel[level]) {
          referrer.referredUserByLevel[level] = [];
        }
        referrer.referredUserByLevel[level].push(referredUserEntry);
        referrer.markModified("referredUserByLevel");

        console.log(`Added new referred user entry for level ${level}.`);
      }

      // Check if the subscription is over or not by checking if subscriptionWalletBalance is 18 dollars or more
      if (referrer.subscriptionWalletBalance >= 18) {
        referrer.walletBalance -= 6;
        referrer.subscriptionWalletBalance -= 18;
        referrer.subscriptionWidhrawBalance = 0;

        referrer.subscriptionHistory.push({
          date: new Date(),
          amount: 6,
        });

        console.log(
          `Subscription is over, resetting subscriptionWalletBalance and subscriptionWidhrawBalance.`
        );
      }

      await referrer.save();

      // Stop if admin is reached
      if (referrer.referalId === "FTR000001") {
        console.log(`Reached admin level, stopping the process.`);
        break;
      }

      // Move to next level's sponsor
      currentSponsorId = referrer.sponsorId; // or referrer.referredById if using that name
      level++;
    }
  };

  // checkAndPayReferBonusAmount = async (referrer, directTeamCount) => {
  //   if (
  //     directTeamCount >= 10 &&
  //     directTeamCount < 20 &&
  //     !referrer.referBonus1Paid
  //   ) {
  //     //Pay Refer Bonus 1 $30

  //     if (!referrer.subscribed) {
  //       referrer.pendingReferBonusIncome =
  //         parseFloat(referrer.pendingReferBonusIncome) + 30;
  //       referrer.pendingWallet = parseFloat(referrer.pendingWallet) + 30;
  //     } else {
  //       referrer.referBonusIncome = parseFloat(referrer.referBonusIncome) + 30;
  //       referrer.mainWallet = parseFloat(referrer.mainWallet) + 30;
  //       referrer.totalMainWallet = parseFloat(referrer.totalMainWallet) + 30;
  //     }
  //   } else if (
  //     directTeamCount >= 20 &&
  //     directTeamCount < 30 &&
  //     !referrer.referBonus2Paid
  //   ) {
  //     //Pay Refer Bonus 1 $70

  //     if (!referrer.subscribed) {
  //       referrer.pendingReferBonusIncome =
  //         parseFloat(referrer.pendingReferBonusIncome) + 70;
  //       referrer.pendingWallet = parseFloat(referrer.pendingWallet) + 70;
  //     } else {
  //       referrer.referBonusIncome = parseFloat(referrer.referBonusIncome) + 70;
  //       referrer.mainWallet = parseFloat(referrer.mainWallet) + 70;
  //       referrer.totalMainWallet = parseFloat(referrer.totalMainWallet) + 70;
  //     }
  //   } else if (directTeamCount >= 30 && !referrer.referBonus3Paid) {
  //     //Pay Refer Bonus 3 $150

  //     if (!referrer.subscribed) {
  //       referrer.pendingReferBonusIncome =
  //         parseFloat(referrer.pendingReferBonusIncome) + 150;
  //       referrer.pendingWallet = parseFloat(referrer.pendingWallet) + 150;
  //     } else {
  //       referrer.referBonusIncome = parseFloat(referrer.referBonusIncome) + 150;
  //       referrer.mainWallet = parseFloat(referrer.mainWallet) + 150;
  //       referrer.totalMainWallet = parseFloat(referrer.totalMainWallet) + 150;
  //     }
  //   }
  //   await referrer.save();
  // };

  // checkAndPayReferAmount = async (amount, user) => {
  //   let currentSponsorId = user.sponsorId;
  //   let level = 0;

  //   console.log(`Level income array length: ${levelIncome.length}`);

  //   while (level < levelIncome.length && currentSponsorId) {
  //     console.log(`Current level: ${level}`);
  //     const referrer = await UserModel.findOne({ referalId: currentSponsorId });

  //     if (!referrer) {
  //       console.log(
  //         `Referrer not found for currentSponsorId: ${currentSponsorId}`
  //       );
  //       break;
  //     }

  //     console.log(`Referrer found for currentSponsorId: ${currentSponsorId}`);

  //     if (!referrer.subscribed) {
  //       referrer.pendingWallet =
  //         parseFloat(referrer.pendingWallet) +
  //         parseFloat(levelIncome[level]) * amount;
  //       referrer.pendingReferIncome =
  //         parseFloat(referrer.pendingWallet) +
  //         parseFloat(levelIncome[level]) * amount;
  //     } else {
  //       // Add income to the current referrer
  //       referrer.mainWallet =
  //         parseFloat(referrer.mainWallet) +
  //         parseFloat(levelIncome[level]) * amount;

  //       referrer.totalMainWalletIncome =
  //         parseFloat(referrer.totalMainWalletIncome) +
  //         parseFloat(levelIncome[level]) * amount;

  //       referrer.referIncome =
  //         parseFloat(referrer.referIncome) +
  //         parseFloat(levelIncome[level]) * amount;
  //     }

  //     console.log(
  //       `Referrer ${referrer.name} (${
  //         referrer.referalId
  //       }) at level ${level} received ${levelIncome[level] * amount} into ${
  //         referrer.subscribed ? "mainWallet" : "pendingWallet"
  //       }. New balance: ${
  //         referrer.subscribed ? referrer.mainWallet : referrer.pendingWallet
  //       }`
  //     );

  //     if (
  //       !referrer?.referredUserByLevel[level]?.some(
  //         (entry) => entry.userId === user._id
  //       )
  //     ) {
  //       const referredUserEntry = {
  //         userId: user._id,
  //         date: new Date(),
  //         reward: parseFloat(levelIncome[level]) * amount,
  //       };

  //       if (!referrer.referredUserByLevel[level]) {
  //         referrer.referredUserByLevel[level] = [];
  //       }
  //       referrer.referredUserByLevel[level].push(referredUserEntry);
  //       referrer.markModified("referredUserByLevel");

  //       console.log(`Added new referred user entry for level ${level}.`);
  //     }

  //     await referrer.save();

  //     if (level == 0) {
  //       const directTeamCount = referrer.referredUserByLevel[0]?.length || 0;
  //       await this.checkAndPayReferBonusAmount(referrer, directTeamCount);
  //     }

  //     // Stop if admin is reached
  //     if (referrer.referalId === "FTR000001") {
  //       console.log(`Reached admin level, stopping the process.`);
  //       break;
  //     }

  //     // Move to next level's sponsor
  //     currentSponsorId = referrer.sponsorId; // or referrer.referredById if using that name
  //     level++;
  //   }
  // };

  payDirectIncome = async (sponsorId, userId) => {
    const user = await UserModel.findById(userId);

    if (!user) {
      console.log("User not found for userId:", userId);
      return;
    }

    const referrer = await UserModel.findOne({ referalId: sponsorId });

    console.log("Referrer found for sponsorId:", referrer);
    console.log("UserId:", userId);

    if (!referrer) {
      console.log("Referrer not found for sponsorId:", sponsorId);
      return;
    }
    if (!user) {
      console.log("User not found for userId:", userId);
      return;
    }

    // Add income to the current referrer
    referrer.walletBalance = parseFloat(referrer.walletBalance) + parseFloat(1);
    referrer.totalEarning = parseFloat(referrer.totalEarning) + parseFloat(1);
    referrer.subscriptionWalletBalance =
      parseFloat(referrer.subscriptionWalletBalance) + parseFloat(1);

    console.log(
      "Added direct income to referrer's wallet and subscription wallet balance."
    );

    // Check if the subscription is over or not by checking if subscriptionWalletBalance is 18 dollars or more
    if (referrer.subscriptionWalletBalance >= 18) {
      referrer.walletBalance -= 6;
      referrer.subscriptionWalletBalance -= 18;
      referrer.subscriptionWidhrawBalance = 0;

      referrer.subscriptionHistory.push({
        date: new Date(),
        amount: 6,
      });

      console.log(
        "Subscription is over, resetting subscriptionWalletBalance and subscriptionWidhrawBalance."
      );
    }

    await referrer.save();
  };

  checkAndPayRoyalty = async (sponsorId) => {
    console.log("Starting checkAndPayRoyalty for sponsorId:", sponsorId);

    const referrer = await UserModel.findOne({ referalId: sponsorId });
    console.log(
      "Referrer found for sponsorId:",
      sponsorId,
      "Referrer data:",
      referrer
    );

    const admin = await AdminModel.findOne({});
    console.log("Admin found:", admin);

    if (!referrer || !admin) {
      console.log("Referrer or admin not found");
      return;
    }

    const currentDate = new Date();
    console.log("Current Date:", currentDate);

    const nextRoyaltyDateFlagFrom = new Date(referrer.nextRoyaltyDateFlagFrom);
    console.log("Next Royalty Date Flag From:", nextRoyaltyDateFlagFrom);

    const daysDiff = Math.floor(
      (currentDate - nextRoyaltyDateFlagFrom) / (1000 * 60 * 60 * 24)
    );
    console.log("Days Difference:", daysDiff);

    const allReferredUsersCount = referrer.referredUserHistory.filter(
      (history) =>
        new Date(history.date) >= nextRoyaltyDateFlagFrom &&
        new Date(history.date) <= currentDate
    ).length;
    console.log("All Referred Users Count:", allReferredUsersCount);

    if (daysDiff <= 7) {
      console.log("Checking for Week royalty");

      if (allReferredUsersCount >= 10) {
        const tenDaysRoyaltyPaid = await RoyaltyPaidHistoryModel.findOne({
          userId: referrer._id,
          royaltyType: "tenDays",
          dateFrom: { $gte: nextRoyaltyDateFlagFrom },
          dateTo: { $lte: currentDate },
        });
        console.log("Ten Days Royalty Paid History found:", tenDaysRoyaltyPaid);

        const weekRoyaltyPaid = await RoyaltyPaidHistoryModel.findOne({
          userId: referrer._id,
          royaltyType: "week",
          dateFrom: { $gte: nextRoyaltyDateFlagFrom },
          dateTo: { $lte: currentDate },
        });
        console.log("Week Royalty Paid History found:", weekRoyaltyPaid);

        if (!weekRoyaltyPaid) {
          //Pay Week
          const royaltyPaidHistory = new RoyaltyPaidHistoryModel({
            userId: referrer._id,
            royaltyReward: null,
            royaltyType: "week",
            status: "pending",
            dateFrom: nextRoyaltyDateFlagFrom,
            dateTo: currentDate,
          });
          await royaltyPaidHistory.save();
          console.log("Week Royalty Paid History saved:", royaltyPaidHistory);

          admin.weekRoyaltyAchiever.push({
            userId: referrer._id,
            rewardHistoryId: royaltyPaidHistory._id,
          });

          await admin.save();
          console.log(
            "Admin weekRoyaltyAchiever updated:",
            admin.weekRoyaltyAchiever
          );
        }
        if (!tenDaysRoyaltyPaid) {
          //Pay Week and set nextRoyaltyDateFlagFrom 10 days ahead
          const royaltyPaidHistory = new RoyaltyPaidHistoryModel({
            userId: referrer._id,
            royaltyReward: null,
            royaltyType: "tenDays",
            status: "pending",
            dateFrom: nextRoyaltyDateFlagFrom,
            dateTo: currentDate,
          });
          await royaltyPaidHistory.save();
          console.log(
            "Ten Days Royalty Paid History saved:",
            royaltyPaidHistory
          );

          admin.tenDaysRoyaltyAchiever.push({
            userId: referrer._id,
            rewardHistoryId: royaltyPaidHistory._id,
          });

          referrer.nextRoyaltyDateFlagFrom = new Date(
            referrer.nextRoyaltyDateFlagFrom.getTime() +
              10 * 24 * 60 * 60 * 1000
          );

          await referrer.save();
          console.log(
            "Referrer nextRoyaltyDateFlagFrom updated:",
            referrer.nextRoyaltyDateFlagFrom
          );

          await admin.save();
          console.log(
            "Admin tenDaysRoyaltyAchiever updated:",
            admin.tenDaysRoyaltyAchiever
          );
        }
      }

      if (allReferredUsersCount >= 5 && allReferredUsersCount < 10) {
        const weekRoyaltyPaid = await RoyaltyPaidHistoryModel.findOne({
          userId: referrer._id,
          royaltyType: "week",
          dateFrom: { $gte: nextRoyaltyDateFlagFrom },
          dateTo: { $lte: currentDate },
        });
        console.log("Week Royalty Paid History found:", weekRoyaltyPaid);

        if (!weekRoyaltyPaid) {
          //Pay Week
          const royaltyPaidHistory = new RoyaltyPaidHistoryModel({
            userId: referrer._id,
            royaltyReward: null,
            royaltyType: "week",
            status: "pending",
            dateFrom: nextRoyaltyDateFlagFrom,
            dateTo: currentDate,
          });
          await royaltyPaidHistory.save();
          console.log("Week Royalty Paid History saved:", royaltyPaidHistory);

          admin.weekRoyaltyAchiever.push({
            userId: referrer._id,
            rewardHistoryId: royaltyPaidHistory._id,
          });

          await admin.save();
          console.log(
            "Admin weekRoyaltyAchiever updated:",
            admin.weekRoyaltyAchiever
          );
        }
      }
    }
    if (daysDiff > 7 && daysDiff <= 10) {
      if (daysDiff == 10) {
        if (allReferredUsersCount >= 10) {
          const tenDaysRoyaltyPaid = await RoyaltyPaidHistoryModel.findOne({
            userId: referrer._id,
            royaltyType: "tenDays",
            dateFrom: { $gte: nextRoyaltyDateFlagFrom },
            dateTo: { $lte: currentDate },
          });
          console.log(
            "Ten Days Royalty Paid History found:",
            tenDaysRoyaltyPaid
          );

          if (!tenDaysRoyaltyPaid) {
            //Pay Week and set nextRoyaltyDateFlagFrom 10 days ahead
            const royaltyPaidHistory = new RoyaltyPaidHistoryModel({
              userId: referrer._id,
              royaltyReward: null,
              royaltyType: "tenDays",
              status: "pending",
              dateFrom: nextRoyaltyDateFlagFrom,
              dateTo: currentDate,
            });
            await royaltyPaidHistory.save();
            console.log(
              "Ten Days Royalty Paid History saved:",
              royaltyPaidHistory
            );

            admin.tenDaysRoyaltyAchiever.push({
              userId: referrer._id,
              rewardHistoryId: royaltyPaidHistory._id,
            });

            await referrer.save();
            console.log(
              "Referrer nextRoyaltyDateFlagFrom updated:",
              referrer.nextRoyaltyDateFlagFrom
            );

            await admin.save();
            console.log(
              "Admin tenDaysRoyaltyAchiever updated:",
              admin.tenDaysRoyaltyAchiever
            );
          }
        }
        referrer.nextRoyaltyDateFlagFrom = new Date(
          referrer.nextRoyaltyDateFlagFrom.getTime() + 10 * 24 * 60 * 60 * 1000
        );
        await referrer.save();
      } else {
        if (allReferredUsersCount >= 10) {
          const tenDaysRoyaltyPaid = await RoyaltyPaidHistoryModel.findOne({
            userId: referrer._id,
            royaltyType: "tenDays",
            dateFrom: { $gte: nextRoyaltyDateFlagFrom },
            dateTo: { $lte: currentDate },
          });
          console.log(
            "Ten Days Royalty Paid History found:",
            tenDaysRoyaltyPaid
          );

          if (!tenDaysRoyaltyPaid) {
            //Pay Week and set nextRoyaltyDateFlagFrom 10 days ahead
            const royaltyPaidHistory = new RoyaltyPaidHistoryModel({
              userId: referrer._id,
              royaltyReward: null,
              royaltyType: "tenDays",
              status: "pending",
              dateFrom: nextRoyaltyDateFlagFrom,
              dateTo: currentDate,
            });
            await royaltyPaidHistory.save();
            console.log(
              "Ten Days Royalty Paid History saved:",
              royaltyPaidHistory
            );

            admin.tenDaysRoyaltyAchiever.push({
              userId: referrer._id,
              rewardHistoryId: royaltyPaidHistory._id,
            });

            referrer.nextRoyaltyDateFlagFrom = new Date(
              referrer.nextRoyaltyDateFlagFrom.getTime() +
                10 * 24 * 60 * 60 * 1000
            );

            await referrer.save();
            console.log(
              "Referrer nextRoyaltyDateFlagFrom updated:",
              referrer.nextRoyaltyDateFlagFrom
            );

            await admin.save();
            console.log(
              "Admin tenDaysRoyaltyAchiever updated:",
              admin.tenDaysRoyaltyAchiever
            );
          }
        }
      }
    }

    if (daysDiff > 10) {
      const currDate = new Date();
      let tempDate = new Date(referrer.nextRoyaltyDateFlagFrom);

      while (tempDate < currDate) {
        tempDate = new Date(tempDate.getTime() + 10 * 24 * 60 * 60 * 1000);
      }
      referrer.nextRoyaltyDateFlagFrom = tempDate;
      await referrer.save();
    }
  };

  // checkAndPayRoyalty = async (sponsorId) => {
  //   console.log("Starting checkAndPayRoyalty for sponsorId:", sponsorId);
  //   const referrer = await UserModel.findOne({ referalId: sponsorId });
  //   console.log(
  //     "Checking and paying royalty income for sponsorId: ",
  //     sponsorId,
  //     "Referrer found:",
  //     referrer
  //   );

  //   const admin = await AdminModel.findOne({});

  //   if (!referrer || !admin) {
  //     console.log("Referrer or admin not found");
  //     return;
  //   }

  //   const currentDate = new Date();
  //   console.log("Current Date:", currentDate);
  //   const nextRoyaltyDateFlagFrom = new Date(referrer.nextRoyaltyDateFlagFrom);
  //   console.log("Next Royalty Date Flag From:", nextRoyaltyDateFlagFrom);

  //   const daysDiff = Math.floor(
  //     (currentDate - nextRoyaltyDateFlagFrom) / (1000 * 60 * 60 * 24)
  //   );
  //   console.log("Days Difference:", daysDiff);

  //   const allReferredUsersCount = referrer.referredUserHistory.filter(
  //     (history) =>
  //       new Date(history.date) >= nextRoyaltyDateFlagFrom &&
  //       new Date(history.date) <= currentDate
  //   ).length;
  //   console.log("All Referred Users Count:", allReferredUsersCount);

  //   if (daysDiff <= 7) {
  //     console.log("Checking for Week royalty");
  //     if (allReferredUsersCount >= 5) {
  //       const weekRoyaltyPaid = await RoyaltyPaidHistoryModel.findOne({
  //         userId: referrer._id,
  //         royaltyType: "week",
  //         dateFrom: { $gte: nextRoyaltyDateFlagFrom },
  //         dateTo: { $lte: currentDate },
  //       });

  //       if (weekRoyaltyPaid) {
  //         console.log("Week royalty already paid for this period.");
  //         return;
  //       }

  //       console.log("Adding User to List");

  //       const royaltyPaidHistory = new RoyaltyPaidHistoryModel({
  //         userId: referrer._id,
  //         royaltyReward: null,
  //         royaltyType: "week",
  //         status: "pending",
  //         dateFrom: nextRoyaltyDateFlagFrom,
  //         dateTo: currentDate,
  //       });
  //       await royaltyPaidHistory.save();
  //       console.log("Week Royalty Paid History saved:", royaltyPaidHistory);

  //       admin.weekRoyaltyAchiever.push({
  //         userId: referrer._id,
  //         rewardHistoryId: royaltyPaidHistory._id,
  //       });

  //       await referrer.save();
  //       await admin.save();
  //       console.log("Referrer and Admin saved for Week Royalty.");
  //     }
  //   }
  //   if (daysDiff > 7 && daysDiff <= 10) {
  //     console.log("Checking for Ten Days royalty");
  //     if (allReferredUsersCount >= 10) {
  //       const tenDaysRoyaltyPaid = await RoyaltyPaidHistoryModel.findOne({
  //         userId: referrer._id,
  //         royaltyType: "tenDays",
  //         dateFrom: { $gte: nextRoyaltyDateFlagFrom },
  //         dateTo: { $lte: currentDate },
  //       });

  //       if (tenDaysRoyaltyPaid) {
  //         console.log("Ten Days royalty already paid for this period.");
  //         return;
  //       }

  //       console.log("Adding User to List");

  //       const royaltyPaidHistory = new RoyaltyPaidHistoryModel({
  //         userId: referrer._id,
  //         royaltyReward: null,
  //         royaltyType: "tenDays",
  //         status: "pending",
  //         dateFrom: nextRoyaltyDateFlagFrom,
  //         dateTo: currentDate,
  //       });
  //       await royaltyPaidHistory.save();
  //       console.log("Ten Days Royalty Paid History saved:", royaltyPaidHistory);

  //       admin.weekRoyaltyAchiever.push({
  //         userId: referrer._id,
  //         rewardHistoryId: royaltyPaidHistory._id,
  //       });

  //       await referrer.save();
  //       await admin.save();
  //       console.log("Referrer and Admin saved for Ten Days Royalty.");

  //       console.log(
  //         "Referrer's nextRoyaltyDateFlagFrom updated:",
  //         referrer.nextRoyaltyDateFlagFrom
  //       );
  //     }
  //     referrer.nextRoyaltyDateFlagFrom = new Date(
  //       referrer.nextRoyaltyDateFlagFrom.getTime() + 10 * 24 * 60 * 60 * 1000
  //     );
  //     await referrer.save();
  //   }
  // };

  // updateROIIncome = async (user) => {
  //   console.log("updateROIIncome called for user:", user._id);
  //   console.log(
  //     "User lastInvestmentDoneOnDate:",
  //     user.lastInvestmentDoneOnDate
  //   );

  //   const lastInvestment = user.lastInvestment;
  //   console.log("User lastInvestment:", lastInvestment);

  //   // Normalize start and end dates
  //   const start = new Date(user.lastInvestmentDoneOnDate);
  //   const end = new Date();
  //   start.setHours(0, 0, 0, 0);
  //   end.setHours(0, 0, 0, 0);
  //   console.log("Normalized start date (investment date):", start);
  //   console.log("Normalized end date (current date):", end);

  //   // Exclude start date
  //   start.setDate(start.getDate() + 1);
  //   console.log("Start date after excluding investment date:", start);

  //   if (start > end) {
  //     console.log("Start date is after end date, returning 0 working days.");
  //     return 0;
  //   }

  //   // Total days difference (inclusive)
  //   const totalDays = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
  //   console.log("Total days difference (inclusive):", totalDays);

  //   // Full weeks and remaining days
  //   const fullWeeks = Math.floor(totalDays / 7);
  //   let workingDays = fullWeeks * 5;
  //   console.log("Full weeks:", fullWeeks);
  //   console.log("Working days from full weeks:", workingDays);

  //   // Handle remaining days
  //   const remainingDays = totalDays % 7;
  //   const startDay = start.getDay(); // 0=Sunday ... 6=Saturday
  //   console.log("Remaining days:", remainingDays);
  //   console.log("Start day of the week (0=Sun, 6=Sat):", startDay);

  //   for (let i = 0; i < remainingDays; i++) {
  //     const day = (startDay + i) % 7;
  //     console.log(
  //       `Checking day ${i + 1} of remaining days. Actual day of week: ${day}`
  //     );
  //     if (day !== 0 && day !== 6) {
  //       // 0 is Sunday, 6 is Saturday
  //       workingDays++;
  //       console.log(
  //         `Day ${day} is a working day. workingDays incremented to: ${workingDays}`
  //       );
  //     } else {
  //       console.log(`Day ${day} is a weekend. No increment.`);
  //     }
  //   }

  //   console.log("Final calculated working days:", workingDays);

  //   let dailyRoiPercentage = 0;
  //   if (lastInvestment >= 100 && lastInvestment <= 999) {
  //     dailyRoiPercentage = 0.04; // 0.40%
  //   } else if (lastInvestment >= 1000 && lastInvestment <= 4999) {
  //     dailyRoiPercentage = 0.05; // 0.50%
  //   } else if (lastInvestment >= 5000) {
  //     dailyRoiPercentage = 0.06; // 0.60%
  //   }
  //   console.log(
  //     "Daily ROI Percentage for last investment:",
  //     dailyRoiPercentage
  //   );

  //   //Pay ROI Income
  //   const potentialROIIncome =
  //     workingDays * (lastInvestment * dailyRoiPercentage);
  //   const maxAllowedROI = lastInvestment * 2;
  //   const totalROIIncomeTillNow = Math.min(potentialROIIncome, maxAllowedROI);

  //   user.roiWallet = parseFloat(totalROIIncomeTillNow);
  //   user.workingDaysFromLastInvestmentTillNow = parseFloat(workingDays);

  //   //Earned 2x of there investment - ReSubscribe to Earn Further
  //   if (potentialROIIncome >= maxAllowedROI) {
  //     user.subscribed = false;
  //     user.workingDaysFromLastInvestmentTillNow = parseFloat(0);
  //   }
  // };

  checkAndPayRewardTeamBusinessAmount = async (userId) => {
    const user = await UserModel.findById(userId);
    if (!user) {
      console.error(`User with ID ${userId} not found.`);
      return; // Or throw an error, depending on desired behavior
    }
    const overAllIncomeTillNow =
      parseFloat(user.mainWallet) + parseFloat(user.roiWallet);

    const directTeamUserIds = user.referredUserHistory.map(
      (entry) => entry.userId
    );

    const directTeamMembers = await UserModel.find({
      _id: { $in: directTeamUserIds },
    });

    const directTeamIncomeData = directTeamMembers.map((member) => {
      const memberOverAllIncome =
        parseFloat(member.mainWallet || 0) + parseFloat(member.roiWallet || 0);
      return {
        userId: member._id,
        name: member.name,
        overAllIncome: memberOverAllIncome,
      };
    });

    // You can now use directTeamIncomeData for further calculations or checks
    // For example, to sum up the total income of the direct team:
    const totalDirectTeamBusiness = directTeamIncomeData.reduce(
      (sum, member) => sum + member.overAllIncome,
      0
    );

    let qualifiedRewardLevel = null;
    for (let i = rewardTeamBusinessAmount.length - 1; i >= 0; i--) {
      const rewardLevel = rewardTeamBusinessAmount[i];
      const { level, businessAmount, reward } = rewardLevel;

      // Condition 1: referrer overall income >= businessAmount
      const referrerMeetsIncome = overAllIncomeTillNow >= businessAmount;

      // Condition 2: total direct team business >= businessAmount
      const teamMeetsBusiness = totalDirectTeamBusiness >= businessAmount;

      // Condition 3: at least one direct team member has overall income >= businessAmount / 2
      const oneMemberMeetsHalfIncome = directTeamIncomeData.some(
        (member) => member.overAllIncome >= businessAmount / 2
      );

      if (
        referrerMeetsIncome &&
        teamMeetsBusiness &&
        oneMemberMeetsHalfIncome
      ) {
        qualifiedRewardLevel = rewardLevel;
        break; // Found the highest applicable level, no need to check lower levels
      }
    }

    if (qualifiedRewardLevel) {
      console.log(
        `User qualifies for Reward Team Business Amount Level ${qualifiedRewardLevel.level}:`
      );
      console.log(
        `  Required Business Amount: ${qualifiedRewardLevel.businessAmount}`
      );
      console.log(`  Reward: ${qualifiedRewardLevel.reward}`);

      // Check if the reward for this level has already been paid
      if (
        !user.rewardTeamBusinessIncomeLevelPaidFlag[qualifiedRewardLevel.level]
      ) {
        if (!user.subscribed) {
          user.pendingRewardTeamBusinessIncome += qualifiedRewardLevel.reward;
          user.pendingWallet += qualifiedRewardLevel.reward;
          console.log(
            `  Reward of ${qualifiedRewardLevel.reward} added to pending for user ${user._id}.`
          );
        } else {
          user.rewardTeamBusinessIncome += qualifiedRewardLevel.reward;
          user.mainWallet += qualifiedRewardLevel.reward;
          user.totalMainWalletIncome += qualifiedRewardLevel.reward;
          console.log(
            `  Reward of ${qualifiedRewardLevel.reward} paid to main wallet for user ${user._id}.`
          );
        }
        user.rewardTeamBusinessIncomeLevelPaidFlag[
          qualifiedRewardLevel.level
        ] = true;
        user.markModified("rewardTeamBusinessIncomeLevelPaidFlag");
        await user.save();
        console.log(
          `  Flag for Reward Team Business Amount Level ${qualifiedRewardLevel.level} set to true for user ${user._id}.`
        );
      } else {
        console.log(
          `  Reward for Level ${qualifiedRewardLevel.level} already paid to user ${user._id}.`
        );
      }
    } else {
      console.log(
        "User does not qualify for any Reward Team Business Amount level based on current criteria."
      );
    }

    console.log(`Total business from direct team: ${totalDirectTeamBusiness}`);
    console.log(`User's overall income: ${overAllIncomeTillNow}`);
  };

  checkAndPayReferBonusAmount = async (referrer, directTeamCount, session) => {
    const bonusTiers = [
      { min: 10, max: 20, amount: 30, flag: "referBonus1Paid" },
      { min: 20, max: 30, amount: 70, flag: "referBonus2Paid" },
      { min: 30, max: Infinity, amount: 150, flag: "referBonus3Paid" },
    ];

    for (const tier of bonusTiers) {
      if (
        directTeamCount >= tier.min &&
        directTeamCount < tier.max &&
        !referrer[tier.flag]
      ) {
        const update = {
          $set: { [tier.flag]: true },
        };

        if (!referrer.subscribed) {
          update.$inc = {
            pendingReferBonusIncome: tier.amount,
            pendingWallet: tier.amount,
          };
        } else {
          update.$inc = {
            referBonusIncome: tier.amount,
            mainWallet: tier.amount,
            totalMainWallet: tier.amount,
          };
        }

        await UserModel.updateOne({ _id: referrer._id }, update, { session });

        break; // only one tier applies
      }
    }
  };

  checkAndPayReferAmount = async (amount, user, session) => {
    let currentSponsorId = user.sponsorId;
    let level = 0;

    const bulkOps = [];

    while (level < levelIncome.length && currentSponsorId) {
      const referrer = await UserModel.findOne(
        { referalId: currentSponsorId },
        null,
        { session }
      );

      if (!referrer) break;

      const reward = parseFloat(levelIncome[level]) * amount;
      const update = { $inc: {} };

      if (!referrer.subscribed) {
        update.$inc.pendingWallet = reward;
        update.$inc.pendingReferIncome = reward;
      } else {
        update.$inc.mainWallet = reward;
        update.$inc.totalMainWalletIncome = reward;
        update.$inc.referIncome = reward;
      }

      // ✅ atomic set for referredUserByLevel
      update.$addToSet = {
        [`referredUserByLevel.${level}`]: {
          userId: user._id,
          date: new Date(),
          reward,
        },
      };

      bulkOps.push({
        updateOne: {
          filter: { _id: referrer._id },
          update,
        },
      });

      if (referrer.referalId === "FTR000001") break; // stop at admin

      currentSponsorId = referrer.sponsorId;
      level++;
    }

    if (bulkOps.length > 0) {
      await UserModel.bulkWrite(bulkOps, { session });
    }
  };

  approveSubscription = async (req, res) => {
    if (req.user.role !== "Admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { userId } = req.body;
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const admin = await AdminModel.findOne({}, null, { session });
      if (!admin) throw new Error("Admin not found");

      const pendingSubs = await PendingSubcriptionModel.findOne(
        { userId },
        null,
        {
          session,
        }
      );
      if (!pendingSubs) throw new Error("Pending subscription not found");

      const user = await UserModel.findById(userId, null, { session });
      if (!user) throw new Error("User not found");

      const now = new Date();

      // 1. Update Admin Turnover
      await AdminModel.updateOne(
        { _id: admin._id },
        { $inc: { companyTurnover: parseFloat(pendingSubs.amount) } },
        { session }
      );

      // 2. Update User Subscription
      await UserModel.updateOne(
        { _id: user._id },
        {
          $set: {
            subscribed: true,
            subscribedOn: now,
            lastInvestment: parseFloat(pendingSubs.amount),
            lastInvestmentDoneOnDate: now,
          },
          $inc: {
            investment: parseFloat(pendingSubs.amount),
          },
        },
        { session }
      );

      // 3. Referrer History + Referral Income
      if (user.sponsorId) {
        const referrer = await UserModel.findOne(
          { referalId: user.sponsorId },
          null,
          { session }
        );
        if (referrer) {
          await UserModel.updateOne(
            { _id: referrer._id },
            {
              $addToSet: {
                referredUserHistory: { date: now, userId: user._id },
              },
            },
            { session }
          );

          const directTeamCount =
            (referrer.referredUserHistory?.length || 0) + 1;

          await this.checkAndPayReferBonusAmount(
            referrer,
            directTeamCount,
            session
          );

          await this.checkAndPayReferAmount(pendingSubs.amount, user, session);
        }
      }

      await UserModel.updateOne(
        { _id: user._id },
        {
          $inc: {
            mainWallet: user.pendingWallet,
            referBonusIncome: user.pendingReferBonusIncome,
            referIncome: user.pendingReferIncome,
            rewardTeamBusinessIncome: user.pendingRewardTeamBusinessIncome,
          },
          $set: {
            pendingWallet: 0,
            pendingReferBonusIncome: 0,
            pendingReferIncome: 0,
            pendingRewardTeamBusinessIncome: 0,
          },
        },
        { session }
      );

      // 4. Approve Subscription
      await ApprovedSubcriptionModel.create(
        [
          {
            userId: userId,
            screenshotPath: user.paymentScreenshotPath,
            hashString: pendingSubs.hashString,
            amount: pendingSubs.amount,
          },
        ],
        { session }
      );

      // 5. Remove Pending Subscription
      const deletedPending = await PendingSubcriptionModel.findOneAndDelete(
        {
          userId: userId,
          screenshotPath: user.paymentScreenshotPath,
        },
        { session }
      );

      // 6. Update User Subscription History (only if pending existed)
      if (deletedPending) {
        await UserModel.updateOne(
          { _id: user._id },
          {
            $push: {
              subscriptionHistory: {
                date: now,
                amount: deletedPending.amount,
                hashString: deletedPending.hashString,
              },
            },
          },
          { session }
        );
      }

      await session.commitTransaction();
      session.endSession();

      return res
        .status(200)
        .json({ message: "Subscription approved successfully" });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error("Error approving subscription:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getAllApprovedSubscriptions = async (req, res) => {
    const role = req.user.role;
    if (role !== "Admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const requests = await ApprovedSubcriptionModel.find({}).populate({
        path: "userId",
        select: "name email phoneNo _id",
      });

      const approvedRequests = requests.map((request) => ({
        ...request.toObject(), // Ensures plain object (not Mongoose doc)
        screenshotPath: `http://${process.env.DOMAIN}/uploads/payments/${request.screenshotPath}`,
      }));

      return res.status(200).json(approvedRequests);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  deleteApprovedSubscription = async (req, res) => {
    const role = req.user.role;
    if (role !== "Admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const subscriptionId = req.params.subscriptionId;
    try {
      const subscription = await ApprovedSubcriptionModel.findByIdAndDelete(
        subscriptionId
      );
      if (!subscription) {
        return res.status(404).json({ message: "Subscription not found" });
      }

      const filePath = path.join(
        __dirname,
        "..",
        "..",
        "uploads/payments",
        subscription.screenshotPath
      );
      deleteUploadedFile({ path: filePath });

      // deleteUploadedFile({
      //   path: `/uploads/payments/${subscription.screenshotPath}`,
      // });

      return res.status(200).json({
        message: "Subscription and associated file deleted successfully",
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  addPaymentDetails = async (req, res) => {
    if (req.user.role != "Admin") {
      return res.status(403).json({
        message: "Access denied. Only admins can add payment details.",
      });
    }
    try {
      const { paymentLink } = req.body;
      const walletQR = req.file;
      const id = req.user.id;
      if (!paymentLink) {
        if (req.file) {
          deleteUploadedFile({
            path: `uploads/paymentQR/${req.file.filename}`,
          });
        }
        return res
          .status(400)
          .json({ message: "Please provide payment link." });
      }
      const admin = await AdminModel.findById(id);
      if (!admin) {
        return res.status(404).json({ message: "Admin not found." });
      }
      admin.paymentLink = paymentLink;
      if (admin.walletQR) {
        deleteUploadedFile({
          path: admin.walletQR,
        });
      }
      if (walletQR) {
        admin.walletQR = `uploads/paymentQR/${walletQR.filename}`;
      }
      await admin.save();
      return res
        .status(200)
        .json({ message: "Payment link added successfully." });
    } catch (error) {
      console.error(error);
      if (req.file) {
        deleteUploadedFile({
          path: `uploads/paymentQR/${req.file.filename}`,
        });
      }
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getPaymentDetails = async (req, res) => {
    try {
      const admin = await AdminModel.findOne({});
      if (!admin) {
        return res.status(404).json({ message: "Admin not found." });
      }
      return res.status(200).json({
        paymentLink: admin.paymentLink,
        subscriptionAmount: admin.subscriptionAmount,
        qrPath: admin.walletQR,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };
  addNotification = async (req, res) => {
    try {
      const { message } = req.body;
      const id = req.user.id;
      if (!message) {
        return res
          .status(400)
          .json({ message: "Please provide both message and userId." });
      }

      const admin = await AdminModel.findById(id);
      if (!admin) {
        return res.status(404).json({ message: "Admin not found." });
      }
      admin.notification = message;
      await admin.save();
      return res
        .status(200)
        .json({ message: "Notification added successfully." });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getNotification = async (req, res) => {
    try {
      const adminList = await AdminModel.find({});
      const admin = adminList[0]; // assuming single admin
      if (!admin) {
        return res.status(404).json({ message: "Admin not found." });
      }
      return res.status(200).json({ notification: admin.notification });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  deleteNotification = async (req, res) => {
    try {
      const id = req.user.id;
      const admin = await AdminModel.findById(id);
      if (!admin) {
        return res.status(404).json({ message: "Admin not found." });
      }
      admin.notification = "";
      await admin.save();
      return res
        .status(200)
        .json({ message: "Notification deleted successfully." });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };
}

export default AdminController;
