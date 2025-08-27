import mongoose from "mongoose";

const referredUserSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const ReferredUserModel = mongoose.model("ReferredUser", referredUserSchema);

export default ReferredUserModel;
