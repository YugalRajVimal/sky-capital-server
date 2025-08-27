import multer from "multer";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "./uploads/walletQRs"); // Store videos in the 'uploads/videos' directory
  },
  filename: (req, file, cb) => {
    // Generate a unique filename with the current timestamp and original file extension
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

// Set up the multer middleware
export const walletQRUpload = multer({
  storage: storage,
});
