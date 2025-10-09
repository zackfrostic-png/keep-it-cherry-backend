require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 4000;

// ✅ Connect to Neon Postgres
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ✅ Middleware
app.use(cors({ origin: "*" }));
app.use(bodyParser.json());

// ✅ Health check
app.get("/", (req, res) => {
  res.json({ message: "🚀 Keep It Cherry backend is running with Postgres!" });
});

/* ------------------------------------------------------------------
   🚘 VEHICLES API
------------------------------------------------------------------ */

// ✅ Create a new vehicle
app.post("/api/vehicles", async (req, res) => {
  try {
    const { year, make, model, mileage } = req.body;
    if (!year || !make || !model) {
      return res.status(400).json({ error: "year, make, and model are required" });
    }

    const miles = Number(String(mileage ?? "0").replace(/[^\d]/g, "")) || 0;

    const result = await pool.query(
      `INSERT INTO vehicles (year, make, model, mileage)
       VALUES ($1, $2, $3, $4)
       RETURNING id, year, make, model, mileage::text, created_at`,
      [Number(year), make, model, miles]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Database error (POST /api/vehicles):", err);
    res.status(500).json({ error: "Failed to save vehicle" });
  }
});

// ✅ Get all vehicles
app.get("/api/vehicles", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, year, make, model, mileage::text, created_at
       FROM vehicles ORDER BY id DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Database error (GET /api/vehicles):", err);
    res.status(500).json({ error: "Failed to fetch vehicles" });
  }
});

// ✅ Delete ALL vehicles
app.delete("/api/vehicles/all", async (req, res) => {
  try {
    await pool.query("TRUNCATE TABLE vehicles RESTART IDENTITY CASCADE");
    res.json({ success: true, message: "All vehicles deleted." });
  } catch (err) {
    console.error("❌ Error deleting all vehicles:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Update vehicle mileage
app.patch("/api/vehicles/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const miles = Number(String(req.body?.mileage ?? "0").replace(/[^\d]/g, ""));
    if (isNaN(miles)) return res.status(400).json({ error: "Mileage must be a number" });

    const result = await pool.query(
      `UPDATE vehicles SET mileage = $1 WHERE id = $2
       RETURNING id, year, make, model, mileage::text, created_at`,
      [miles, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: "Vehicle not found" });

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Database error (PATCH /api/vehicles/:id):", err);
    res.status(500).json({ error: "Failed to update vehicle" });
  }
});

// ✅ Delete a vehicle
app.delete("/api/vehicles/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`DELETE FROM vehicles WHERE id = $1`, [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Vehicle not found" });
    res.json({ success: true, deletedId: id });
  } catch (err) {
    console.error("❌ Database error (DELETE /api/vehicles/:id):", err);
    res.status(500).json({ error: "Failed to delete vehicle" });
  }
});

/* ------------------------------------------------------------------
   🛠️ SERVICE HISTORY API
------------------------------------------------------------------ */

// ✅ Delete ALL service records (safe and cascades)
app.delete("/api/services/all", async (req, res) => {
  try {
    await pool.query("TRUNCATE TABLE service_history RESTART IDENTITY CASCADE");
    res.json({ success: true, message: "All service records deleted." });
  } catch (err) {
    console.error("❌ Error deleting all services:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Add a new service record
app.post("/api/services", async (req, res) => {
  try {
    const { vehicle_id, service_name, mileage, interval, service_date, cost, notes } = req.body;
    if (!vehicle_id || !service_name) {
      return res.status(400).json({ error: "vehicle_id and service_name are required" });
    }

    const result = await pool.query(
      `INSERT INTO service_history (vehicle_id, service_name, mileage, interval, service_date, cost, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [vehicle_id, service_name, mileage, interval || null, service_date || null, cost || null, notes || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Database error (POST /api/services):", err);
    res.status(500).json({ error: "Failed to create service record" });
  }
});

// ✅ Get all service records (optionally filter by vehicle)
app.get("/api/services", async (req, res) => {
  try {
    const { vehicle_id } = req.query;
    const result = await pool.query(
      vehicle_id
        ? `SELECT * FROM service_history WHERE vehicle_id = $1 ORDER BY service_date DESC`
        : `SELECT * FROM service_history ORDER BY service_date DESC`,
      vehicle_id ? [vehicle_id] : []
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Database error (GET /api/services):", err);
    res.status(500).json({ error: "Failed to fetch service records" });
  }
});

// ✅ Delete a single service record
app.delete("/api/services/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`DELETE FROM service_history WHERE id = $1`, [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Service record not found" });
    res.json({ success: true, deletedId: id });
  } catch (err) {
    console.error("❌ Database error (DELETE /api/services/:id):", err);
    res.status(500).json({ error: "Failed to delete service record" });
  }
});

/* ------------------------------------------------------------------
   📊 VEHICLE CATALOG API
------------------------------------------------------------------ */

app.get("/api/catalog", async (req, res) => {
  try {
    const { year, make, model } = req.query;
    let conditions = [];
    let values = [];

    if (year) {
      conditions.push(`year = $${conditions.length + 1}`);
      values.push(Number(year));
    }
    if (make) {
      conditions.push(`make ILIKE $${conditions.length + 1}`);
      values.push(`%${make}%`);
    }
    if (model) {
      conditions.push(`model ILIKE $${conditions.length + 1}`);
      values.push(`%${model}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `
      SELECT year, make, model, trim, engine, transmission
      FROM vehicle_catalog
      ${whereClause}
      ORDER BY year DESC, make ASC, model ASC
      LIMIT 50000
      `,
      values
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Catalog query error:", err);
    res.status(500).json({ error: "Failed to fetch vehicle catalog" });
  }
});

/* ------------------------------------------------------------------
   ✅ Start the server
------------------------------------------------------------------ */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ API running on port ${PORT}`);
});
