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

const userSchema = new mongoose.Schema({
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
    required: true,
  },
  sponsorName: {
    type: String,
    required: true,
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
  referalEnabled: {
    type: Boolean,
    default: false,
  },
  mainWalletBalance: {
    type: Number,
    default: 0,
  },
  walletBalance: {
    type: Number,
    default: 0,
  },
  totalEarning: {
    type: Number,
    default: 0,
  },
  totalWithdrawalAmount: {
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
  subscriptionHistory: {
    type: [
      {
        date: Date,
        amount: Number,
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
      for (let i = 0; i <= 9; i++) {
        levels[i] = [];
      }
      return levels;
    },
  },
  allReferredUserByLevel: {
    type: mongoose.Schema.Types.Mixed,
    default: () => {
      const levels = {};
      for (let i = 0; i <= 9; i++) {
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
});

const UserModel = mongoose.model("User", userSchema);

export default UserModel;
