import mongoose from "mongoose";

const transactionHashSchema = new mongoose.Schema({
  transactionHash: {
    type: String,
    required: true,
    unique: true, // ensures no duplicate hashes are stored
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const TransactionHashModel = mongoose.model(
  "TransactionHash",
  transactionHashSchema
);

export default TransactionHashModel;
