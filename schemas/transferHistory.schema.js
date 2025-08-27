import mongoose from "mongoose";

const TransferHistorySchema = new mongoose.Schema({
  recieverUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  senderUserId: {
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

const TransferHostoryModel = mongoose.model(
  "TransferHistory",
  TransferHistorySchema
);

export default TransferHostoryModel;
