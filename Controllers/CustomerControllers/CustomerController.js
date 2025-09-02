import sendMail from "../../config/nodeMailer.config.js";
import { deleteUploadedFile } from "../../middlewares/fileDelete.middleware.js";
import AdminModel from "../../schemas/admin.schema.js";
import PendingSubcriptionModel from "../../schemas/pendingSubscription.schema.js";
import UserModel from "../../schemas/user.schema.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cron from "node-cron";
import WidhrawalRequestModel from "../../schemas/widhrawalRequest.schema.js";
import TransferHostoryModel from "../../schemas/transferHistory.schema.js";
import AdminController from "../AdminControllers/AdminController.js";
import TransferToMainWalletHistoryModel from "../../schemas/transferToMainWalletHistory.schema.js";
import RoyaltyPaidHistoryModel from "../../schemas/royaltyPaidHistory.schema.js";
import TransactionHashModel from "../../schemas/TransactionHash.js";

import mongoose from "mongoose";

class CustomerController {
  home = async (req, res) => {
    res.json({ message: "Hello Customer" });
  };

  checkAuth = async (req, res) => {
    try {
      return res.status(200).json({ message: "Authorized" });
    } catch (error) {
      return res.status(401).json({ message: "Unauthorized" });
    }
  };

  signUp = async (req, res) => {
    const { email, password, sponsorId, name, phoneNo } = req.body;
    const lowerCaseEmail = email.toLowerCase();
    if (!email || !password || !sponsorId || !name || !phoneNo) {
      return res.status(400).json({ message: "All fields are required" });
    }
    try {
      const existingUserUsingEmail = await UserModel.findOne({ email });
      const existingUserUsingPhone = await UserModel.findOne({ phoneNo });

      if (
        existingUserUsingEmail &&
        existingUserUsingPhone &&
        existingUserUsingEmail._id.toString() !==
          existingUserUsingPhone._id.toString()
      ) {
        return res.status(409).json({
          message: "User with this email and phone number already exists.",
        });
      }

      if (existingUserUsingEmail) {
        if (!existingUserUsingEmail.verified) {
          const otp = Math.floor(Math.random() * 900000) + 100000;
          await UserModel.findByIdAndUpdate(existingUserUsingEmail._id, {
            otp,
          });
          const message = `Your OTP is: ${otp}`;
          await sendMail(email, "Sign Up OTP", message);
          return res.status(200).json({
            message:
              "User already exists. OTP sent to your email. Verify Account",
          });
        }
        return res
          .status(409)
          .json({ message: "Email already in use. Login." });
      }

      if (existingUserUsingPhone) {
        return res
          .status(409)
          .json({ message: "Phone number already in use." });
      }

      const existingSponsor = await UserModel.findOne({
        referalId: sponsorId,
      });

      if (!existingSponsor) {
        return res.status(404).json({ message: "Sponsor not found" });
      }

      const sponsor = await UserModel.findOne({ referalId: sponsorId });

      const newReferralId = await this.generateUniqueReferalCode();

      const ancestry = sponsor
        ? [...sponsor.ancestry, newReferralId]
        : [newReferralId];

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = new UserModel({
        email: lowerCaseEmail,
        password: hashedPassword,
        sponsorId,
        sponsorName: existingSponsor.name,
        name,
        phoneNo,
        role: "Customer",
        referalId: newReferralId,
        ancestry,
      });

      let currentSponsorId = sponsorId;
      let level = 0;

      while (level < 3 && currentSponsorId) {
        if (
          !existingSponsor.allReferredUserByLevel[level].some(
            (entry) => entry.userId === newUser._id
          )
        ) {
          const referredUserEntry = {
            userId: newUser._id,
            date: new Date(),
          };

          if (!existingSponsor.allReferredUserByLevel[level]) {
            existingSponsor.allReferredUserByLevel[level] = [];
          }
          existingSponsor.allReferredUserByLevel[level].push(referredUserEntry);
          existingSponsor.markModified("allReferredUserByLevel");

          console.log(`Added new referred user entry for level ${level}.`);
        }

        await existingSponsor.save();

        // Stop if admin is reached
        if (existingSponsor.referalId === "FTR000001") {
          console.log(`Reached admin level, stopping the process.`);
          break;
        }

        // Move to next level's sponsor
        currentSponsorId = existingSponsor.sponsorId; // or referrer.referredById if using that name
        level++;
      }

      if (!newUser.cronJobByLevelStartedOn) {
        newUser.cronJobByLevelStartedOn = {};
      }

      await newUser.save();
      // Generate a random 6 digit OTP using crypto
      const otp = Math.floor(Math.random() * 900000) + 100000;
      // Save OTP to the user document
      await UserModel.findByIdAndUpdate(newUser.id, { otp }, { new: true });
      // Send OTP to the user's email
      const message = `Your OTP is: ${otp}`;
      await sendMail(email, "Sign Up OTP", message);
      res.status(201).json({
        message: "Sign Up successful. OTP sent to your email. Verify Account",
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  verifyAccount = async (req, res) => {
    const { email, otp } = req.body;
    const lowerCaseEmail = email.toLowerCase();

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }
    try {
      const user = await UserModel.findOne({ email: lowerCaseEmail });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.accountBlocked) {
        return res
          .status(403)
          .json({ message: "Account is blocked. Please contact Admin." });
      }

      if (user.otp !== otp) {
        return res.status(401).json({ message: "Invalid OTP" });
      }
      user.otp = null;
      user.save();
      // Verify the user and update the verified field to true
      await UserModel.findByIdAndUpdate(
        user.id,
        { verified: true },
        { new: true }
      );
      // Generate a JSON Web Token
      const token = jwt.sign(
        { id: user.id, email: user.email, role: "Customer" },
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
    const lowerCaseEmail = email.toLowerCase();

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }
    try {
      const user = await UserModel.findOne({ email: lowerCaseEmail });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      if (user.accountBlocked) {
        return res
          .status(403)
          .json({ message: "Account is blocked. Please contact Admin." });
      }
      if (!user.verified) {
        const otp = Math.floor(Math.random() * 900000) + 100000;
        // Save OTP to the user document
        await UserModel.findByIdAndUpdate(user.id, { otp }, { new: true });
        const message = `Your OTP is: ${otp}`;
        await sendMail(lowerCaseEmail, "Sign Up OTP", message);
        return res.status(403).json({
          message: "User not verified. OTP sent to your email. Verify Account",
        });
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      // Generate a JSON Web Token
      const token = jwt.sign(
        { id: user.id, email: user.email, role: "Customer" },
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
    const lowerCaseEmail = email.toLowerCase();

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    try {
      const user = await UserModel.findOne({ email: lowerCaseEmail });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      // Encrypt the new password
      const encryptedPassword = await bcrypt.hash(newPassword, 10);
      // Update the user document with the new password and set verified to false
      // Generate OTP
      const otp = Math.floor(Math.random() * 900000) + 100000;

      await UserModel.findByIdAndUpdate(
        user.id,
        { otp, password: encryptedPassword, verified: false },
        { new: true }
      );
      // Send OTP to the user's email
      const message = `Your OTP is: ${otp}`;
      await sendMail(lowerCaseEmail, "Reset Password OTP", message);
      return res.status(200).json({
        message: "OTP sent to your Email, Verify youseft to reset Password.",
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  changePassword = async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "Old and new passwords are required" });
    }
    try {
      const user = await UserModel.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const isMatch = await bcrypt.compare(oldPassword, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: "Old password is incorrect" });
      }
      const encryptedPassword = await bcrypt.hash(newPassword, 10);
      await UserModel.findByIdAndUpdate(
        user.id,
        { password: encryptedPassword },
        { new: true }
      );
      return res.status(200).json({ message: "Password changed successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  //Dashboard
  // getCustomerProfileData = async (req, res) => {
  //   const { id } = req.user;
  //   try {
  //     const user = await UserModel.findById(id)
  //       .populate("referredUserHistory.userId", "subscribed") // only fetch `subscribed` field
  //       .lean();
  //     if (!user) {
  //       return res.status(404).json({ message: "User not found" });
  //     }

  //     const userData = { ...user };
  //     delete userData.password;

  //     if (!userData.referalEnabled || !userData.subscribed) {
  //       delete userData.referalId;
  //     }

  //     const referredUsers = user.referredUserHistory || [];

  //     const directTeamCountActive = referredUsers.filter(
  //       (entry) => entry.userId?.subscribed === true
  //     ).length;

  //     const directTeamCountNonActive = referredUsers.filter(
  //       (entry) => entry.userId?.subscribed === false
  //     ).length;

  //     const directTeamIncome = user.referredUserHistory?.length;

  //     const userDoc = await UserModel.findById(id).lean();

  //     const allLevelReferrals = [];

  //     for (let level = 0; level <= 9; level++) {
  //       const levelEntries = userDoc.referredUserByLevel?.[level] || [];
  //       allLevelReferrals.push(...levelEntries);
  //     }

  //     const userIds = allLevelReferrals.map((entry) => entry.userId);

  //     // Fetch subscribed users
  //     const subscribedUsers = await UserModel.find({
  //       _id: { $in: userIds },
  //       subscribed: true,
  //     }).select("_id");

  //     // Fetch unsubscribed users
  //     const unsubscribedUsers = await UserModel.find({
  //       _id: { $in: userIds },
  //       subscribed: false,
  //     }).select("_id");

  //     const subscribedUserIds = new Set(
  //       subscribedUsers.map((u) => u._id.toString())
  //     );
  //     const unsubscribedUserIds = new Set(
  //       unsubscribedUsers.map((u) => u._id.toString())
  //     );

  //     // Count subscribed
  //     const subscribedLevelUserCount = allLevelReferrals.filter((entry) =>
  //       subscribedUserIds.has(entry.userId.toString())
  //     ).length;

  //     // Count unsubscribed
  //     const unsubscribedLevelUserCount = allLevelReferrals.filter((entry) =>
  //       unsubscribedUserIds.has(entry.userId.toString())
  //     ).length;

  //     console.log(
  //       "✅ Subscribed referred users by level:",
  //       subscribedLevelUserCount
  //     );
  //     console.log(
  //       "❌ Unsubscribed referred users by level:",
  //       unsubscribedLevelUserCount
  //     );

  //     // Store or return if needed
  //     const levelTeamCountActive = subscribedLevelUserCount;
  //     const levelTeamCountNonActive = unsubscribedLevelUserCount;

  //     var levelTeamIncome;

  //     if (userData.referredUserByLevel) {
  //       levelTeamIncome = Object.values(userData.referredUserByLevel).reduce(
  //         (acc, level) =>
  //           acc +
  //           level.reduce(
  //             (sum, user) => sum + (user.reward ? user.reward : 0),
  //             0
  //           ),
  //         0
  //       );
  //     }

  //     const worldLegTeamCountActive = await UserModel.countDocuments({
  //       subscribed: true,
  //     });
  //     const worldLegTeamCountNonActive = await UserModel.countDocuments({
  //       subscribed: false,
  //     });

  //     const worldLegTeamIncome = Object.values(
  //       userData.cronJobByLevelIncome
  //     ).reduce((acc, level) => acc + level, 0);

  //     var royaltyIncome = 0;

  //     if (userData.tenDaysRoyaltyPaid) {
  //       royaltyIncome = userData.tenDaysRoyaltyReward;
  //     } else if (userData.weekRoyaltyPaid) {
  //       royaltyIncome = userData.weekRoyaltyReward;
  //     }

  //     const totalIncome = royaltyIncome + worldLegTeamIncome + levelTeamIncome;

  //     const admin = await AdminModel.findOne({});
  //     if (!admin) {
  //       return res.status(404).json({ message: "Admin not found" });
  //     }
  //     const companyTurnOver = admin.companyTurnover;

  //     const withdrawalList = await WidhrawalRequestModel.find({
  //       userId: userData._id,
  //       status: "approved",
  //     });
  //     const totalSuccessPayment = withdrawalList.reduce(
  //       (acc, withdrawal) => acc + parseFloat(withdrawal.requestAmount),
  //       0
  //     );

  //     // start Cron Jobs
  //     const adminController = new AdminController();
  //     // await adminController.startCronJobs(user);
  //     await adminController.resumeCronJobs();

  //     // Adding calculated data to userData
  //     userData.totalWithdrawalAmount = totalSuccessPayment;
  //     userData.directTeamCount = directTeamCountActive;
  //     userData.directTeamCountNonActive = directTeamCountNonActive;

  //     userData.directTeamIncome = directTeamIncome;
  //     userData.levelTeamCount = levelTeamCountActive;
  //     userData.levelTeamCountNonActive = levelTeamCountNonActive;

  //     userData.levelTeamIncome = levelTeamIncome;
  //     userData.worldLegTeamCount = worldLegTeamCountActive;
  //     userData.worldLegTeamCountNonActive = worldLegTeamCountNonActive;

  //     userData.worldLegTeamIncome = worldLegTeamIncome;
  //     userData.royaltyIncome = royaltyIncome;
  //     userData.totalIncome = totalIncome;
  //     userData.companyTurnOver = companyTurnOver;

  //     return res.status(200).json(userData);
  //   } catch (error) {
  //     console.error(error);
  //     res.status(500).json({ message: "Internal Server Error" });
  //   }
  // };

  generateUniqueReferalCode = async () => {
    let uniqueCode = "FTR";
    let isUnique = false;
    let code;

    while (!isUnique) {
      // Generate a 6-digit random number (between 100000 and 999999)
      code = uniqueCode + (Math.floor(Math.random() * 900000) + 100000);
      const existingUser = await UserModel.findOne({ referalId: code });
      if (!existingUser) {
        isUnique = true;
      }
    }

    return code;
  };

  // ---- Utility: calculate working days between two dates (exclusive of start, inclusive of end) ----
  calculateWorkingDays(startDate, endDate) {
    if (!startDate || !endDate) return 0;

    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    if (start >= end) return 0;

    const nextDay = new Date(start);
    nextDay.setDate(start.getDate() + 1);

    const totalDays = Math.floor((end - nextDay) / 86400000) + 1;
    const fullWeeks = Math.floor(totalDays / 7);

    let workingDays = fullWeeks * 5;
    const remaining = totalDays % 7;
    const startDay = nextDay.getDay();

    for (let i = 0; i < remaining; i++) {
      const day = (startDay + i) % 7;
      if (day !== 0 && day !== 6) workingDays++;
    }

    return workingDays;
  }

  // ---- ROI Calculation ----
  // updateROIIncome = async (id) => {
  //   const session = await mongoose.startSession();
  //   session.startTransaction();

  //   try {
  //     const user = await UserModel.findById(id).session(session);
  //     if (!user || !user.lastInvestment || !user.lastInvestmentDoneOnDate) {
  //       await session.abortTransaction();
  //       session.endSession();
  //       return null;
  //     }

  //     const workingDays = this.calculateWorkingDays(
  //       user.lastInvestmentDoneOnDate,
  //       new Date()
  //     );
  //     const lastInvestment = Number(user.lastInvestment);

  //     let dailyRoiPercentage = 0;
  //     if (lastInvestment >= 100 && lastInvestment <= 999)
  //       dailyRoiPercentage = 0.04;
  //     else if (lastInvestment >= 1000 && lastInvestment <= 4999)
  //       dailyRoiPercentage = 0.05;
  //     else if (lastInvestment >= 5000) dailyRoiPercentage = 0.06;

  //     const potentialROIIncome =
  //       workingDays * (lastInvestment * dailyRoiPercentage);
  //     const maxAllowedROI = lastInvestment * 2;
  //     const totalROIIncomeTillNow = Math.min(potentialROIIncome, maxAllowedROI);

  //     // Apply updates atomically inside the transaction
  //     const updatedUser = await UserModel.findByIdAndUpdate(
  //       id,
  //       {
  //         $set: {
  //           roiWallet: totalROIIncomeTillNow,

  //           subscribed: potentialROIIncome >= maxAllowedROI ? false : true,
  //         },
  //       },
  //       { new: true, session } // return updated doc
  //     );

  //     await session.commitTransaction();
  //     session.endSession();

  //     return updatedUser;
  //   } catch (error) {
  //     await session.abortTransaction();
  //     session.endSession();
  //     throw error;
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

  // ---- Controller ----
  getCustomerProfileData = async (req, res) => {
    const { id } = req.user;

    try {
      // Update ROI first (transaction safe)
      // try {
      //   await this.updateROIIncome(id);
      // } catch (roiError) {
      //   console.warn("ROI update failed, continuing:", roiError.message);
      // }
      // const updatedUser = await this.updateROIIncome(id);

      const user = await UserModel.findById(id)
        .populate("referredUserHistory.userId", "subscribed")
        .lean();

      if (!user) return res.status(404).json({ message: "User not found" });

      await this.checkAndPayRewardTeamBusinessAmount(user._id);

      // Convert to plain object safely
      const userData = user;
      delete userData.password;

      userData.subscribed = userData.subscribed ?? false;

      // Calculate direct team members counts
      userData.totalDirectTeamMembersCount =
        userData.referredUserHistory.length;

      userData.activeDirectTeamMembersCount =
        userData.referredUserHistory.filter(
          (ref) => ref.userId?.subscribed
        ).length;

      userData.totalLevelTeamMembersCount = 0;
      for (let level = 0; level <= 2; level++) {
        if (
          userData.referredUserByLevel &&
          userData.referredUserByLevel[level]
        ) {
          userData.totalLevelTeamMembersCount +=
            userData.referredUserByLevel[level].length;
        }
      }

      userData.totalWorldTeamCount = await UserModel.countDocuments({
        ancestry: user.referalId,
      });

      const withdrawalList = await WidhrawalRequestModel.find({
        userId: userData._id,
        status: "approved",
      });

      return res.status(200).json(userData);
    } catch (error) {
      console.error("getCustomerProfileData error:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  //Profile Details
  getProfileDetails = async (req, res) => {
    const { id } = req.user;
    try {
      const user = await UserModel.findById(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const profileDetails = {
        name: user.name,
        email: user.email,
        phoneNo: user.phoneNo,
        userId: user._id,
        sponsorId: user.sponsorId,
        sponsorName: user.sponsorName,
        subscribed: user.subscribed,
        joinedOn: user.subscribedOn,
        idType: user.idType,
        bankId: user.bankId,
        referalId: user.referalId,
      };
      // if (user.referalEnabled) {
      //   profileDetails.referalId = user.referalId;
      // }
      return res.status(200).json(profileDetails);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  updateBankDetails = async (req, res) => {
    const { idType, bankId } = req.body;
    // const walletQR = req.file;

    if (!idType || !bankId) {
      return res
        .status(400)
        .json({ message: "All three fields are mandatory" });
    }

    const { id } = req.user;
    try {
      const user = await UserModel.findById(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      user.idType = idType;
      user.bankId = bankId;

      await user.save();
      return res
        .status(200)
        .json({ message: "Bank details updated successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getReferalDetails = async (req, res) => {
    const { id } = req.user;
    try {
      const user = await UserModel.findById(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      // if (user.referalEnabled && user.subscribed) {
      return res.status(200).json({
        referalId: user.referalId,
        name: user.name,
      });
      // } else {
      //   return res.status(403).json({
      //     message: "Please purchase a subscription to access referal details.",
      //   });
      // }
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getTeamDetails = async (req, res) => {
    const teamRef = Number(req.query.teamRef);
    const { id } = req.user;

    try {
      const user = await UserModel.findById(id).populate({
        path: "referredUserHistory.userId",
        select:
          "_id name email phoneNo sponsorId referalId createdOn firstInvestment subscribedOn subscribed",
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const levelsData = user.referredUserByLevel;

      // Direct Team Only
      if (teamRef === 0) {
        const nonSubscribedUsers = await UserModel.find({
          sponsorId: user.referalId,
          subscribed: false,
        }).select("-password");

        return res.status(200).json({
          level: "0",
          users: user.referredUserHistory,
          nonSubscribedUsers: nonSubscribedUsers,
        });
      }

      // All Level Teams
      if (teamRef === 1) {
        const populatedLevels = {};

        for (const level in levelsData) {
          const entries = levelsData[level];

          const populatedEntries = await Promise.all(
            entries.map(async (entry) => {
              const userDoc = await UserModel.findById(entry.userId).select(
                "name email phoneNo sponsorId sponsorName referalId createdOn firstInvestment subscribed subscribedOn"
              );

              const userObj = userDoc?.toObject();

              return {
                ...entry,
                user: userObj,
              };
            })
          );

          populatedLevels[level] = populatedEntries;
        }

        const populatedAllReferred = {};
        const unsubscribedUsersByLevel = {}; // <-- to store unsubscribed users

        for (let level in user.allReferredUserByLevel) {
          const referredUsers = user.allReferredUserByLevel[level];

          const populatedUsers = await Promise.all(
            referredUsers.map(async (entry) => {
              const referredUser = await UserModel.findById(entry.userId)
                .select("-password")
                .lean();

              return {
                ...entry,
                userId: referredUser, // populated user
              };
            })
          );

          // Save all populated users (optional)
          populatedAllReferred[level] = populatedUsers;

          // 🔍 Filter users with subscribed: false
          const unsubscribed = populatedUsers.filter(
            (entry) => entry.userId && entry.userId.subscribed === false
          );

          unsubscribedUsersByLevel[level] = unsubscribed;
        }

        return res.status(200).json({
          levels: populatedLevels,
          unsubscribedUsersByLevel: unsubscribedUsersByLevel,
        });
      }

      if (teamRef === 2) {
        const allActiveUsers = await UserModel.find({
          subscribed: true,
          subscribedOn: { $gt: user.subscribedOn },
        });
        const allNonActiveUsers = await UserModel.find({
          subscribed: false,
          subscribedOn: { $gt: user.subscribedOn },
        });
        return res.status(200).json({ allActiveUsers, allNonActiveUsers });
      }

      return res.status(400).json({ message: "Invalid teamRef parameter" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  depositMoney = async (req, res) => {
    const { amount } = req.body;
    const { id } = req.user;
    try {
      const user = await UserModel.findById(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      if (!user.verified) {
        return res.status(403).json({ message: "User is not verified" });
      }
      user.walletBalance = parseFloat(user.walletBalance) + parseFloat(amount);
      user.totalEarning = parseFloat(user.totalEarning) + parseFloat(amount);
      await user.save();
      return res.status(200).json({
        message: "Money deposited successfully",
        walletBalance: user.walletBalance,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  // This function handles the purchase of a subscription by a user.
  purchaseSubscription = async (req, res) => {
    const { id } = req.user; // Extract the user's ID from the request.
    const filename = req.file.filename;
    const hashString = req.body.hashString;
    const amount = req.body.amount;

    console.log(filename);
    try {
      const user = await UserModel.findById(id); // Find the user by their ID.
      if (!user) {
        deleteUploadedFile(req.file);
        return res.status(404).json({ message: "User not found" }); // Return an error if the user is not found.
      }
      if (!user.verified) {
        deleteUploadedFile(req.file);
        return res.status(401).json({ message: "User is not verified" }); // Return an error if the user is not verified.
      }
      if (user.subscribed) {
        deleteUploadedFile(req.file);
        return res
          .status(409)
          .json({ message: "You already invested in a Plan." }); // Return an error if the user is already subscribed.
      }
      if (Number(amount) < user.lastInvestment) {
        deleteUploadedFile(req.file);
        return res.status(400).json({
          message: `Investment amount ($${amount}) cannot be less than your previous investment ($${user.lastInvestment}).`,
        });
      }
      if (!filename || !hashString) {
        deleteUploadedFile(req.file);
        return res
          .status(400)
          .json({ message: "File and Hash String are required" });
      }

      const existingPendingSubscription = await PendingSubcriptionModel.findOne(
        { userId: user._id }
      );
      if (existingPendingSubscription) {
        deleteUploadedFile(req.file);
        return res.status(409).json({
          message: "A pending subscription already exists for this user.",
        });
      }

      const existingHashString = await TransactionHashModel.findOne({
        transactionHash: hashString,
      });

      if (existingHashString) {
        if (user.transactionHashRepeatCount >= 3) {
          user.accountBlocked = true;
          await user.save();
          return res.status(211).json({
            message:
              "Account blocked due to excessive transaction hash attempts.",
          });
        }

        user.transactionHashRepeatCount =
          Number(user.transactionHashRepeatCount) + 1;
        user.save();

        deleteUploadedFile(req.file);
        return res.status(409).json({
          message: `A transaction with this transaction hash already exists. ${
            3 - user.transactionHashRepeatCount
          } attepts left.`,
        });
      }

      user.paymentScreenshotPath = filename;
      await user.save(); // Save the updated user.

      const transactionHash = new TransactionHashModel({
        transactionHash: hashString,
      });
      await transactionHash.save();

      const pendingSubscription = new PendingSubcriptionModel({
        userId: user._id,
        screenshotPath: filename,
        amount,
        hashString,
      });
      await pendingSubscription.save();

      return res.status(201).json({
        message: "Subscription applied successfully",
      }); // Return a success response with the user's wallet balance and referral ID.
    } catch (error) {
      deleteUploadedFile(req.file);
      console.error(error); // Log any errors that occur.
      res.status(500).json({ message: "Service Unavailable" }); // Return an error if the service is unavailable.
    }
  };

  withdrawalRequest = async (req, res) => {
    const { requestAmount, walletAddress, selectedWallet } = req.body;
    const userId = req.user.id;
    try {
      const existingWithdrawalRequest = await WidhrawalRequestModel.findOne({
        userId,
        status: "pending",
        walletType: selectedWallet,
      });
      if (existingWithdrawalRequest) {
        return res.status(409).json({
          message: "A pending withdrawal request already exists for this user.",
        });
      }

      const user = await UserModel.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (requestAmount < 10) {
        return res
          .status(400)
          .json({ message: "Minimum widhraw amount is $10" });
      }

      if (selectedWallet == "roi") {
        const currentDate = new Date();
        const dayOfMonth = currentDate.getDate();

        if (dayOfMonth !== 15 && dayOfMonth !== 30) {
          return res.status(400).json({
            message:
              "Withdrawals can only be requested on the 15th or 30th of each month.",
          });
        }
        if (requestAmount > user.roiWallet) {
          return res.status(400).json({ message: "Insufficient balance" });
        }
      }
      if (selectedWallet == "main") {
        if (requestAmount > user.mainWallet) {
          return res.status(400).json({ message: "Insufficient balance" });
        }
      }

      const newWithdrawalRequest = new WidhrawalRequestModel({
        userId,
        requestAmount,
        walletAddress,
        walletType: selectedWallet,
        status: "pending",
      });
      await newWithdrawalRequest.save();
      return res
        .status(201)
        .json({ message: "Withdrawal request submitted successfully" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getUserWidhrawalRequest = async (req, res) => {
    const userId = req.user.id;
    try {
      const withdrawalRequests = await WidhrawalRequestModel.find({ userId });
      return res.status(200).json(withdrawalRequests);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  transferMoney = async (req, res) => {
    const { userId, amount, remark } = req.body;
    const senderId = req.user.id;

    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const senderUser = await UserModel.findById(senderId).session(session);
      const receiverUser = await UserModel.findById(userId).session(session);
      const admin = await AdminModel.findOne({}).session(session);

      if (!senderUser || !receiverUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check balance
      if (senderUser.mainWallet < amount) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      // Prevent duplicate subscription if pending exists
      const pendingSubscription = await PendingSubcriptionModel.findOne({
        userId: receiverUser._id,
        screenshotPath: receiverUser.paymentScreenshotPath,
      }).session(session);

      if (pendingSubscription) {
        return res
          .status(400)
          .json({ message: "A pending subscription already exists." });
      }

      if (receiverUser.subscribed) {
        return res
          .status(400)
          .json({ message: "Receiver is already subscribed." });
      }

      // Update balances
      senderUser.mainWallet -= parseFloat(amount);
      admin.companyTurnover =
        parseFloat(admin.companyTurnover) + parseFloat(amount);

      // Subscribe Receiver
      const now = new Date();
      receiverUser.subscribed = true;
      receiverUser.subscribedOn = now;
      receiverUser.lastInvestment = parseFloat(amount);
      receiverUser.lastInvestmentDoneOnDate = now;
      receiverUser.lastInvestmentRoiWallet = 0;
      receiverUser.investment =
        parseFloat(receiverUser.investment) + parseFloat(amount);

      // First investment logic
      if (!receiverUser.firstInvestment || receiverUser.firstInvestment === 0) {
        receiverUser.firstInvestment = parseFloat(amount);

        const referrer = await UserModel.findOne({
          referalId: receiverUser.sponsorId,
        }).session(session);

        if (referrer) {
          const directTeamCount =
            (referrer.referredUserHistory?.length || 0) + 1;

          const adminController = new AdminController();
          await adminController.checkAndPayReferBonusAmount(
            referrer,
            directTeamCount,
            session
          );
          await adminController.checkAndPayReferAmount(
            amount,
            receiverUser,
            session
          );

          // Push into referredUserHistory if not exists
          await UserModel.updateOne(
            {
              _id: referrer._id,
              "referredUserHistory.userId": { $ne: receiverUser._id },
            },
            {
              $addToSet: {
                referredUserHistory: { date: now, userId: receiverUser._id },
              },
            },
            { session }
          );
        }
      }

      // Track receiver’s subscription history
      receiverUser.subscriptionHistory.push({
        date: now,
        amount: parseFloat(amount),
      });

      // Move pending incomes → main wallet
      await UserModel.updateOne(
        { _id: receiverUser._id },
        {
          $inc: {
            mainWallet: receiverUser.pendingWallet,
            referBonusIncome: receiverUser.pendingReferBonusIncome,
            referIncome: receiverUser.pendingReferIncome,
            rewardTeamBusinessIncome:
              receiverUser.pendingRewardTeamBusinessIncome,
            roiToLevelIncome: receiverUser.pendingRoiToLevelIncome,
          },
          $set: {
            pendingWallet: 0,
            pendingReferBonusIncome: 0,
            pendingReferIncome: 0,
            pendingRewardTeamBusinessIncome: 0,
            pendingRoiToLevelIncome: 0,
          },
        },
        { session }
      );

      // Save Transfer History
      await TransferHostoryModel.create(
        [
          {
            userId: senderId,
            senderUserId: senderId,
            recieverUserId: userId,
            amount: amount.toString(),
            remark: remark || "Deposit for another user",
          },
        ],
        { session }
      );

      await senderUser.save({ session });
      await receiverUser.save({ session });
      await admin.save({ session });

      await session.commitTransaction();
      session.endSession();

      return res
        .status(200)
        .json({ message: "Deposit for another user successful" });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error("Error in transferMoney:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getSenderTransferHistory = async (req, res) => {
    const userId = req.user.id;
    try {
      const transferHistory = await TransferHostoryModel.find({
        senderUserId: userId,
      }).populate("recieverUserId", "_id name email phoneNo");
      return res.status(200).json(transferHistory);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  transferMoneyToMainWallet = async (req, res) => {
    const userId = req.user.id;
    const { amount, remark } = req.body;
    if (!amount) {
      return res.status(400).json({ message: "Amount is required" });
    }
    try {
      const user = await UserModel.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.walletBalance < amount) {
        return res.status(400).json({ message: "Insufficient wallet balance" });
      }

      const subscriptionWidhrawBalance = user.subscriptionWidhrawBalance;

      if (subscriptionWidhrawBalance === 12) {
        return res.status(400).json({
          message:
            "You cannot withdraw until your subscription is renewed using WalletBalance",
        });
      }

      if (amount > 12 || amount < 6) {
        return res.status(400).json({
          message: `You cannot withdraw more than $12 and less than $6`,
        });
      }

      if (
        subscriptionWidhrawBalance < 12 &&
        amount > 12 - subscriptionWidhrawBalance
      ) {
        return res.status(400).json({
          message:
            `You already widhrawn $${subscriptionWidhrawBalance} out of $18. Next $6 is reserved for Renew Subscription. You can only withdraw a maximum of ` +
            (12 - subscriptionWidhrawBalance) +
            " amount",
        });
      }

      //Transfer Amount to Main Wallet Success

      user.walletBalance -= amount;
      user.mainWalletBalance =
        parseFloat(user.mainWalletBalance) + parseFloat(amount);
      user.subscriptionWidhrawBalance =
        parseFloat(user.subscriptionWidhrawBalance) + parseFloat(amount);
      await user.save();

      const transferToMainWalletHistory = new TransferToMainWalletHistoryModel({
        userId: userId,
        amount: amount.toString(),
        remark: remark,
      });

      await transferToMainWalletHistory.save();

      return res
        .status(200)
        .json({ message: "Money transferred to main wallet successfully" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getUserRoyaltyIncomeDetails = async (req, res) => {
    try {
      const userId = req.user.id;
      const user = await UserModel.findById(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const allRoyalty = await RoyaltyPaidHistoryModel.find({ userId });

      // Group by dateFrom
      const grouped = {};
      allRoyalty.forEach((entry) => {
        const key = new Date(entry.dateFrom).toISOString().split("T")[0];
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(entry);
      });

      // Apply selection logic for each group
      const filteredResults = [];

      Object.values(grouped).forEach((entries) => {
        const hasTenDays = entries.some((e) => e.royaltyType === "tenDays");

        if (hasTenDays) {
          filteredResults.push(
            ...entries.filter((e) => e.royaltyType === "tenDays")
          );
        } else {
          filteredResults.push(
            ...entries.filter((e) => e.royaltyType === "week")
          );
        }
      });

      // Calculate royaltyIncome for 'paid' entries
      const royaltyIncome = filteredResults
        .filter((e) => e.status === "paid")
        .reduce((sum, e) => sum + (e.royaltyReward || 0), 0);

      return res.status(200).json({
        royaltyIncome,
        data: filteredResults,
      });
    } catch (error) {
      console.error("Error in getUserRoyaltyIncomeDetails:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  get fetchUserName() {
    return async (req, res) => {
      try {
        const id = req.body.userId;
        console.log(id);
        const user = await UserModel.findById(id);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
        return res.status(200).json({ name: user.name, email: user.email });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal Server Error" });
      }
    };
  }
}

export default CustomerController;
