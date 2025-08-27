import mongoose from "mongoose";

const WidhrawalRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  walletAddress: {
    type: String,
  },
  requestAmount: {
    type: String,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
  },
});

const WidhrawalRequestModel = mongoose.model(
  "WidhrawalRequest",
  WidhrawalRequestSchema
);

export default WidhrawalRequestModel;
