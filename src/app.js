import "dotenv/config";

import express from "express";
import cors from "cors";

import batteryRoutes from "./routes/batteryRoutes.js";
import vehicleRoutes from "./routes/vehicleRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import routeRoutes from "./routes/routeRoutes.js";
import demoRoutes from "./routes/demoRoutes.js";
import authRoutes from "./routes/authRoutes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "GreenMile Backend is running",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/demo", demoRoutes);
app.use("/api/battery", batteryRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/users", userRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/routes", routeRoutes);

export default app;
