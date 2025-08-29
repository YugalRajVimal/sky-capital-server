import "dotenv/config";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import router from "./routes.js";
import { connectUsingMongoose } from "./config/mongoose.config.js";
import UserModel from "./schemas/user.schema.js";
import AdminController from "./Controllers/AdminControllers/AdminController.js";

import { fileURLToPath } from "url";
import { dirname } from "path";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

app.use(
  cors({
    // origin: ['https://threexfuture.onrender.com', 'https://abhayreferral.onrender.com'],
    origin: "*",
    credentials: true,
  })
);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const port = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Hello, World!");
});

app.use("/api", router);

app.use("/uploads/payments", express.static("uploads/payments"));
app.use("/uploads/paymentQR", express.static("uploads/paymentQR"));
app.use("/uploads/walletQRs", express.static("uploads/walletQRs"));

app.get("/download/:encodedPath", (req, res) => {
  const encodedPath = req.params.encodedPath;
  const decodedPath = decodeURIComponent(encodedPath);
  const filePath = path.join(__dirname, decodedPath);

  console.log("Decoded path:", filePath);

  res.download(filePath, path.basename(filePath), (err) => {
    if (err) {
      console.error("Download error:", err);
      res.status(500).send("Failed to download.");
    }
  });
});

const adminController = new AdminController();

app.listen(port, async () => {
  console.log(`Server running at http://localhost:${port}/`);
  connectUsingMongoose();
  // adminController.updateROIIncome({
  //   _id: "test_user_id_for_roi", // Added a dummy user ID as it's logged in the function
  //   lastInvestmentDoneOnDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // Corrected to a Date object representing 10 days ago for meaningful ROI calculation
  //   lastInvestment: 1000, // Added a dummy lastInvestment amount as it's logged in the function
  // });
  // adminController.resumeCronJobs();
});
