import jwt from "jsonwebtoken";
import AdminController from "../Controllers/AdminControllers/AdminController.js";

// Role & maintenance check
const checkUserRole = async (req) => {
  if (req.user.role !== "Admin") {
    const adminController = new AdminController();
    const isOnMaintenance = await adminController.isSiteOnMaintenanceServer();

    if (isOnMaintenance) {
      return false; // Deny access
    }
  }
  return true; // Allow access
};

// JWT Auth Middleware
const jwtAuth = async (req, res, next) => {
  const token = req.headers["authorization"];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload) {
      return res.status(401).json({ error: "Unauthorized Access" });
    }

    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
    };

    const isAllowed = await checkUserRole(req);
    if (!isAllowed) {
      return res.status(503).json({ error: "Site is On Maintenance" });
    }

    next(); // Pass to next middleware or route handler
  } catch (error) {
    console.log(error);
    return res.status(401).json({ error: "Unauthorized Access" });
  }
};

export default jwtAuth;
