import mongoose from "mongoose";

const RoyaltyPaidHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  royaltyReward: {
    type: Number,
  },
  royaltyType: {
    type: String,
  },
  status: {
    type: String,
    enum: ['pending', 'paid'],
  },
  dateFrom: {
    type: Date,
  },
  dateTo: {
    type: Date,
  },
});

const RoyaltyPaidHistoryModel = mongoose.model(
  "RoyaltyPaidHistory",
  RoyaltyPaidHistorySchema
);

export default RoyaltyPaidHistoryModel;
