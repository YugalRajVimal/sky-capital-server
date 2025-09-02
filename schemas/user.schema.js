import mongoose, { Mongoose } from "mongoose";

const referredUserSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Important: Reference to User model
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    phoneNo: {
      type: String,
      required: true,
      unique: true,
    },
    role: {
      type: String,
    },
    password: {
      type: String,
    },
    sponsorId: {
      type: String,

    },
    sponsorName: {
      type: String,

    },
    otp: {
      type: String,
    },
    otpExpires: {
      type: Date,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    referalId: {
      type: String,
    },
    ancestry: {
      type: [String],
      index: true,
    },
    // referalEnabled: {
    //   type: Boolean,
    //   default: false,
    // },
    mainWalletBalance: {
      type: Number,
      default: 0,
    },
    walletBalance: {
      type: Number,
      default: 0,
    },
    mainWallet: {
      type: Number,
      default: 0,
    },
    roiWallet: {
      type: Number,
      default: 0,
    },
    lastInvestmentRoiWallet: {
      type: Number,
      default: 0,
    },
    pendingWallet: {
      type: Number,
      default: 0,
    },
    totalROIIncome: {
      type: Number,
      default: 0,
    },
    totalMainWalletIncome: {
      type: Number,
      default: 0,
    },
    referIncome: {
      type: Number,
      default: 0,
    },
    referBonusIncome: {
      type: Number,
      default: 0,
    },
    referBonus1Paid: {
      type: Boolean,
      default: false,
    },
    referBonus2Paid: {
      type: Boolean,
      default: false,
    },
    referBonus3Paid: {
      type: Boolean,
      default: false,
    },
    rewardTeamBusinessIncome: {
      type: Number,
      default: 0,
    },
    rewardTeamBusinessIncomeLevelPaidFlag: {
      type: Object,
      default: () => {
        const levels = {};
        for (let i = 0; i <= 9; i++) {
          levels[i] = false;
        }
        return levels;
      },
    },
    pendingReferIncome: {
      type: Number,
      default: 0,
    },
    pendingReferBonusIncome: {
      type: Number,
      default: 0,
    },
    pendingRewardTeamBusinessIncome: {
      type: Number,
      default: 0,
    },
    roiToLevelIncome: {
      type: Number,
      default: 0,
    },
    totalRoiToLevelIncome:{
      type: Number,
      default: 0,
    },
    pendingRoiToLevelIncome: {
      type: Number,
      default: 0,
    },
    totalEarning: {
      type: Number,
      default: 0,
    },
    mainWithdrawalAmount: {
      type: Number,
      default: 0,
    },
    roiWithdrawalAmount: {
      type: Number,
      default: 0,
    },
    subscriptionWalletBalance: {
      type: Number,
      default: 0,
    },
    subscriptionWidhrawBalance: {
      type: Number,
      default: 0,
    },
    investment: {
      type: Number,
      default: 0,
    },
    firstInvestment: {
      type: Number,
      default: 0,
    },
    lastInvestment: {
      type: Number,
      default: 0,
    },
    lastInvestmentDoneOnDate: {
      type: Date,
    },
    workingDaysFromLastInvestmentTillNow: {
      type: Number,
    },
    subscriptionHistory: {
      type: [
        {
          date: Date,
          amount: Number,
          hashString: String,
          // Add other necessary fields as needed
        },
      ],
      default: [],
    },
    referredUserHistory: {
      type: [referredUserSchema],
      default: [],
    },
    worldUsersWhenSubscribed: {
      type: Number,
      default: 0,
    },
    subscribed: {
      type: Boolean,
      default: false,
    },
    weekRoyaltyPaid: {
      type: Boolean,
      default: false,
    },
    weekRoyaltyReward: {
      type: Number,
      default: 0,
    },
    tenDaysRoyaltyPaid: {
      type: Boolean,
      default: false,
    },
    tenDaysRoyaltyReward: {
      type: Number,
      default: 0,
    },
    subscribedOn: {
      type: Date,
    },
    nextRoyaltyDateFlagFrom: {
      type: Date,
    },
    referredUserByLevel: {
      type: mongoose.Schema.Types.Mixed,
      default: () => {
        const levels = {};
        for (let i = 0; i <= 3; i++) {
          levels[i] = [];
        }
        return levels;
      },
    },
    allReferredUserByLevel: {
      type: mongoose.Schema.Types.Mixed,
      default: () => {
        const levels = {};
        for (let i = 0; i <= 3; i++) {
          levels[i] = [];
        }
        return levels;
      },
    },
    cronJobByLevelIncome: {
      type: Object,
      default: () => {
        const levels = {};
        for (let i = 0; i <= 9; i++) {
          levels[i] = 0;
        }
        return levels;
      },
    },
    cronJobByLevelStarted: {
      type: Object,
      default: () => {
        const levels = {};
        for (let i = 0; i <= 9; i++) {
          levels[i] = false;
        }
        return levels;
      },
    },
    cronJobByLevelStartedOn: {
      type: Object,
      default: () => {
        const levels = {};
        for (let i = 0; i <= 9; i++) {
          levels[i] = null;
        }
        return levels;
      },
    },
    dailyCronJobIncomeLog: {
      type: Object,
      default: () => ({}),
    },
    cronJobProgress: {
      type: Object,
      default: () => {
        const levels = {};
        for (let i = 0; i <= 9; i++) {
          levels[i] = null;
        }
        return levels;
      },
    },
    paymentScreenshotPath: {
      type: String,
    },
    transactionHashRepeatCount: {
      type: Number,
      default: 0,
    },
    accountBlocked: {
      type: Boolean,
    },
    idType: {
      type: String,
    },
    bankId: {
      type: String,
    },
    walletQR: {
      type: String,
    },
  },
  { timestamps: true }
); // Added timestamps option here

const UserModel = mongoose.model("User", userSchema);

export default UserModel;
