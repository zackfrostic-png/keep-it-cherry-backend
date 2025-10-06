// importVehicles.js
const fs = require("fs");
const { Pool } = require("pg");
const csv = require("csv-parser");
require("dotenv").config();

// ✅ Connect to Neon database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ✅ Path to your CSV file
const CSV_FILE_PATH = "C:/Users/DELL/Desktop/keep-it-cherry-backend/vehicle_catalog_sample.csv";

async function importCSV() {
  const client = await pool.connect();
  try {
    console.log("🚀 Starting CSV import...");

    // Read and insert rows
    const rows = [];
    fs.createReadStream(CSV_FILE_PATH)
      .pipe(csv())
      .on("data", (row) => {
        rows.push(row);
      })
      .on("end", async () => {
        console.log(`📄 Found ${rows.length} rows. Inserting into database...`);

        for (const row of rows) {
          const { year, make, model, mileage } = row;
          await client.query(
            "INSERT INTO vehicles (year, make, model, mileage) VALUES ($1, $2, $3, $4)",
            [year, make, model, mileage || "0"]
          );
        }

        console.log("✅ Import complete!");
        client.release();
        process.exit(0);
      });
  } catch (err) {
    console.error("❌ Import failed:", err);
    client.release();
    process.exit(1);
  }
}

importCSV();
