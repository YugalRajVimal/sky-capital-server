import mongoose from "mongoose";

const adminSchema = new mongoose.Schema({
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
  subscriptionAmount: {
    type: Number,
    default: 6,
  },
  paymentLink: {
    type: String,
  },
  walletQR: {
    type: String,
  },
  companyTurnover: {
    type: Number,
    default: 0,
  },
  companyTurnoverByDate: {
    type: [
      {
        date: Date,
        amount: Number,
      },
    ],
    default: [],
  },
  weekRoyaltyAchiever: {
    type: [
      {
        userId: mongoose.Schema.Types.ObjectId,
        rewardHistoryId: mongoose.Schema.Types.ObjectId,
      },
    ],
    default: [],
  },
  tenDaysRoyaltyAchiever: {
    type: [
      {
        userId: mongoose.Schema.Types.ObjectId,
        rewardHistoryId: mongoose.Schema.Types.ObjectId,
      },
    ],
    default: [],
  },
  notification: {
    type: String,
  },
  isSiteOnMaintenance: {
    type: Boolean,
  },
});

const AdminModel = mongoose.model("Admin", adminSchema);

export default AdminModel;
