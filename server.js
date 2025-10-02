// server.js
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
// ✅ Use Render’s dynamic port OR 4000 locally
const PORT = process.env.PORT || 4000;

// ✅ Connect to Neon Postgres
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ✅ Middleware
app.use(cors());
app.use(bodyParser.json());

// ✅ Health check
app.get("/", (req, res) => {
  res.json({ message: "🚀 Keep It Cherry backend is running with Postgres!" });
});

// ✅ Add a new vehicle
app.post("/api/vehicles", async (req, res) => {
  const { year, make, model, mileage } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO vehicles (year, make, model, mileage) VALUES ($1, $2, $3, $4) RETURNING *",
      [year, make, model, mileage]
    );
    res.status(201).json({ success: true, vehicle: result.rows[0] });
  } catch (err) {
    console.error("❌ Database error:", err);
    res.status(500).json({ error: "Failed to save vehicle" });
  }
});

// ✅ Fetch all vehicles
app.get("/api/vehicles", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM vehicles");
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Database error:", err);
    res.status(500).json({ error: "Failed to fetch vehicles" });
  }
});

// ✅ Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ API running on port ${PORT}`);
});
