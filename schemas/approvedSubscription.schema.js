import mongoose from "mongoose";

const approvedSubscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  screenshotPath: {
    type: String,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

const ApprovedSubcriptionModel = mongoose.model(
  "approvedSubscription",
  approvedSubscriptionSchema
);

export default ApprovedSubcriptionModel;
