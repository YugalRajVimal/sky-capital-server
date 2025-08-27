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

  getCustomerProfileData = async (req, res) => {
    const { id } = req.user;
    try {
      const user = await UserModel.findById(id)
        .populate("referredUserHistory.userId", "subscribed")
        .lean();

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const userData = { ...user };
      delete userData.password;

      // Ensure default values
      userData.referalEnabled = userData.referalEnabled ?? false;
      userData.subscribed = userData.subscribed ?? false;
      userData.referredUserHistory = userData.referredUserHistory || [];
      userData.referredUserByLevel = userData.referredUserByLevel || {};
      userData.cronJobByLevelIncome = userData.cronJobByLevelIncome || {};
      userData.tenDaysRoyaltyReward = userData.tenDaysRoyaltyReward || 0;
      userData.weekRoyaltyReward = userData.weekRoyaltyReward || 0;

      if (!userData.referalEnabled || !userData.subscribed) {
        delete userData.referalId;
      }

      const referredUsers = userData.referredUserHistory;

      const directTeamCountActive = referredUsers.filter(
        (entry) => entry.userId?.subscribed === true
      ).length;

      const directTeamCountNonActive = await UserModel.countDocuments({
        sponsorId: user.referalId,
        subscribed: false,
      });

      const directTeamIncome = referredUsers.length;

      const userDoc = await UserModel.findById(id).lean();

      const allLevelReferrals = [];
      for (let level = 0; level <= 9; level++) {
        const levelEntries = userDoc.referredUserByLevel?.[level] || [];
        allLevelReferrals.push(...levelEntries);
      }

      let totalUnsubscribedCount = 0;
      const unsubscribedCountByLevel = {};

      for (const level in user.allReferredUserByLevel) {
        const referredUsers = user.allReferredUserByLevel[level];

        const unsubscribedUsers = await Promise.all(
          referredUsers.map(async (entry) => {
            const referredUser = await UserModel.findById(entry.userId)
              .select("subscribed")
              .lean();

            if (referredUser && referredUser.subscribed === false) {
              return true; // Non-active
            }
            return false; // Active or not found
          })
        );

        const levelUnsubscribedCount = unsubscribedUsers.filter(Boolean).length;

        unsubscribedCountByLevel[level] = levelUnsubscribedCount;
        totalUnsubscribedCount += levelUnsubscribedCount;
      }

      console.log("Unsubscribed count by level:", unsubscribedCountByLevel);
      console.log("Total unsubscribed users:", totalUnsubscribedCount);

      const userIds = allLevelReferrals.map((entry) => entry.userId);

      const [subscribedUsers, unsubscribedUsers] = await Promise.all([
        UserModel.find({ _id: { $in: userIds }, subscribed: true }).select(
          "_id"
        ),
        UserModel.find({ _id: { $in: userIds }, subscribed: false }).select(
          "_id"
        ),
      ]);

      const subscribedUserIds = new Set(
        subscribedUsers.map((u) => u._id.toString())
      );

      const subscribedLevelUserCount = allLevelReferrals.filter((entry) =>
        subscribedUserIds.has(entry.userId.toString())
      ).length;

      const levelTeamCountActive = subscribedLevelUserCount;

      let levelTeamIncome = 0;
      if (userData.referredUserByLevel) {
        levelTeamIncome = Object.values(
          userData.referredUserByLevel || {}
        ).reduce(
          (acc, level) =>
            acc +
            level.reduce(
              (sum, user) => sum + (user.reward ? user.reward : 0),
              0
            ),
          0
        );
      }

      const worldLegTeamCountActive = await UserModel.countDocuments({
        subscribed: true,
        subscribedOn: { $gt: user.subscribedOn },
      });
      const worldLegTeamCountNonActive = await UserModel.countDocuments({
        subscribed: false,
        subscribedOn: { $gt: user.subscribedOn },
      });

      const worldLegTeamIncome = Object.values(
        userData.cronJobByLevelIncome || {}
      ).reduce((acc, level) => acc + level, 0);

      let royaltyIncome = 0;
      if (userData.tenDaysRoyaltyPaid) {
        royaltyIncome = userData.tenDaysRoyaltyReward;
      } else if (userData.weekRoyaltyPaid) {
        royaltyIncome = userData.weekRoyaltyReward;
      }

      const totalIncome = royaltyIncome + worldLegTeamIncome + levelTeamIncome;

      const admin = await AdminModel.findOne({});
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }

      const companyTurnOver = admin.companyTurnover;

      const withdrawalList = await WidhrawalRequestModel.find({
        userId: userData._id,
        status: "approved",
      });

      const totalSuccessPayment = withdrawalList.reduce(
        (acc, withdrawal) => acc + parseFloat(withdrawal.requestAmount),
        0
      );

      // Cron job resume
      // console.log("checking");
      const adminController = new AdminController();

      await adminController.startCronJobs(user._id);
      await adminController.resumeCronJobs();

      // Attach calculated data
      userData.totalWithdrawalAmount = totalSuccessPayment;
      userData.directTeamCount = directTeamCountActive;
      userData.directTeamCountNonActive = directTeamCountNonActive;
      userData.directTeamIncome = directTeamIncome;

      userData.levelTeamCount = levelTeamCountActive;
      userData.levelTeamCountNonActive = totalUnsubscribedCount;
      userData.levelTeamIncome = levelTeamIncome;

      userData.worldLegTeamCount = worldLegTeamCountActive;
      userData.worldLegTeamCountNonActive = worldLegTeamCountNonActive;
      userData.worldLegTeamIncome = worldLegTeamIncome;

      userData.royaltyIncome = royaltyIncome;
      userData.totalIncome = totalIncome;
      userData.companyTurnOver = companyTurnOver;

      return res.status(200).json(userData);
    } catch (error) {
      console.error(error);
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
      };
      if (user.referalEnabled) {
        profileDetails.referalId = user.referalId;
      }
      return res.status(200).json(profileDetails);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  updateBankDetails = async (req, res) => {
    const { idType, bankId } = req.body;
    const walletQR = req.file;
    console.log(idType, bankId, walletQR);

    if (!idType || !bankId || !walletQR) {
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
      if (user.walletQR) {
        deleteUploadedFile({ path: user.walletQR });
        user.walletQR = walletQR.path;
      }
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
          "_id name email phoneNo sponsorId referalId createdOn subscribedOn subscribed",
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
                "name email phoneNo sponsorId sponsorName referalId subscribed subscribedOn referalEnabled"
              );

              const userObj = userDoc?.toObject();
              if (!userObj?.referalEnabled) {
                delete userObj?.referalId;
              }

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
          .json({ message: "You are already a subscriber." }); // Return an error if the user is already subscribed.
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
    const { requestAmount, walletAddress } = req.body;
    const userId = req.user.id;
    try {
      const existingWithdrawalRequest = await WidhrawalRequestModel.findOne({
        userId,
        status: "pending",
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

      if (requestAmount < 6) {
        return res
          .status(400)
          .json({ message: "Minimum widhraw amount is $6" });
      }

      if (requestAmount > user.mainWalletBalance) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      const newWithdrawalRequest = new WidhrawalRequestModel({
        userId,
        requestAmount,
        walletAddress,
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
    const { userId, remark } = req.body;
    const senderId = req.user.id;
    try {
      // Since there's no function to handle the actual transfer logic, we'll simulate it here
      console.log(`Simulating transfer of from ${senderId} to ${userId}`);
      const senderUser = await UserModel.findById(senderId);
      const recieverUser = await UserModel.findById(userId);

      const pendingSubscription = await PendingSubcriptionModel.findOne({
        userId: recieverUser._id,
        screenshotPath: recieverUser.paymentScreenshotPath,
      });

      if (pendingSubscription) {
        console.log(
          "Pending subscription request found for the receiver user."
        );
        return res.status(400).json({
          message:
            "A pending subscription request already exists by this user.",
        });
      }
      if (recieverUser.subscribed) {
        return res
          .status(400)
          .json({ message: "Receiver user is already subscribed." });
      }

      const admin = await AdminModel.findOne({});
      const amount = admin.subscriptionAmount;

      if (!senderUser || !recieverUser) {
        console.log("One or both users not found.");
        return res.status(404).json({ message: "User not found" });
      }

      if (senderUser.walletBalance < amount) {
        console.log("Sender user has insufficient balance.");
        return res.status(400).json({ message: "Insufficient balance" });
      }

      const subscriptionWidhrawBalance = senderUser.subscriptionWidhrawBalance;

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

      const today = new Date();
      const todayOnly = new Date(today.toISOString().slice(0, 10));
      // Check if entry already exists for today
      const existingEntry = admin.companyTurnoverByDate.find(
        (entry) =>
          new Date(entry.date).toISOString().slice(0, 10) ===
          todayOnly.toISOString().slice(0, 10)
      );

      if (existingEntry) {
        // Update the existing amount
        existingEntry.amount += parseFloat(amount);
      } else {
        // Create a new entry
        admin.companyTurnoverByDate.push({
          date: todayOnly,
          amount: parseFloat(amount),
        });
      }

      admin.companyTurnover =
        parseFloat(admin.companyTurnover) + parseFloat(amount);

      await admin.save();

      const adminController = new AdminController();

      senderUser.walletBalance -= parseFloat(amount);
      senderUser.subscriptionWidhrawBalance =
        parseFloat(senderUser.subscriptionWidhrawBalance) + parseFloat(amount);
      senderUser.save();

      //Subscribe Reciever User
      recieverUser.subscribed = true;
      if (!recieverUser.referalId) {
        recieverUser.referalId =
          await adminController.generateUniqueReferalCode();

        const tempDate = new Date();
        recieverUser.subscribedOn = tempDate;
        recieverUser.nextRoyaltyDateFlagFrom = tempDate;

        const totalWorldUsers = await UserModel.countDocuments({
          subscribed: true,
        });
        recieverUser.worldUsersWhenSubscribed = totalWorldUsers;
        await recieverUser.save();
        await adminController.payDirectIncome(
          recieverUser.sponsorId,
          recieverUser._id
        );
        await adminController.payLevelIncome(
          recieverUser.sponsorId,
          recieverUser._id
        );
      }
      recieverUser.referalEnabled = true;
      recieverUser.investment =
        parseFloat(recieverUser.investment) + parseFloat(amount);
      recieverUser.subscriptionHistory.push({
        date: new Date(),
        amount: amount,
      });
      recieverUser.save();

      const referrer = await UserModel.findOne({
        referalId: recieverUser.sponsorId,
      });

      if (
        referrer &&
        !referrer.referredUserHistory.some(
          (history) => history.userId.toString() === recieverUser._id.toString()
        )
      ) {
        referrer.referredUserHistory.push({
          date: new Date(),
          userId: recieverUser._id,
        });
        await referrer.save();
        await adminController.checkAndPayRoyalty(recieverUser.sponsorId);
      }

      const transferHistory = new TransferHostoryModel({
        userId: senderId,
        senderUserId: senderId,
        recieverUserId: userId,
        amount: amount.toString(),
        remark: remark || "Deposite for another user",
      });
      await transferHistory.save();

      await senderUser.save();
      await recieverUser.save();
      console.log("Transfer successful.");
      return res
        .status(200)
        .json({ message: "Deposit for other User is successful" });
    } catch (error) {
      console.error(error);
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
        return res.status(200).json({ name: user.name });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal Server Error" });
      }
    };
  }
}

export default CustomerController;
