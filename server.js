import "dotenv/config";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import router from "./routes.js";
import { connectUsingMongoose } from "./config/mongoose.config.js";
import UserModel from "./schemas/user.schema.js";
import AdminController from "./Controllers/AdminControllers/AdminController.js";

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

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
  adminController.resumeCronJobs();
});
