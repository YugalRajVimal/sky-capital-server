import mongoose from "mongoose";

const pendingSubscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  screenshotPath: {
    type: String,
  },
  hashString: {
    type: String,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

const PendingSubcriptionModel = mongoose.model(
  "PendingSubscription",
  pendingSubscriptionSchema
);

export default PendingSubcriptionModel;
