import mongoose from "mongoose";

const TransferToMainWalletHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  amount: {
    type: String,
  },
  remark: {
    type: String,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

const TransferToMainWalletHistoryModel = mongoose.model(
  "TransferToMainWalletHistory",
  TransferToMainWalletHistorySchema
);

export default TransferToMainWalletHistoryModel;
