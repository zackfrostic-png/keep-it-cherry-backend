// csv_to_sql.js  (Neon-ready, chunked INSERT files)
// Creates sql_chunks/vehicle_catalog_part_XXX.sql with proper INSERT header + trailing semicolon.

const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

// ---- Config ----
const INPUT_CSV = path.resolve("vehicle_catalog_master.csv");
const OUT_DIR = path.resolve("sql_chunks");
const TABLE = "vehicle_catalog";
const COLUMNS = ["year", "make", "model", "trim", "engine", "transmission"];
const CHUNK_ROWS = 2000; // rows per .sql file (safe for Neon editor)

// ---- Helpers ----
function esc(v) {
  if (v === null || v === undefined) v = "";
  return `'${String(v).replace(/'/g, "''")}'`;
}
function numOrNull(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : "NULL";
}
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// ---- Writer ----
let chunkIndex = 1;
let rows = [];

function chunkFileName(i) {
  return path.join(OUT_DIR, `vehicle_catalog_part_${String(i).padStart(3, "0")}.sql`);
}

function writeChunk() {
  if (rows.length === 0) return;
  let sql = "";

  // First chunk also ensures table exists
  if (chunkIndex === 1) {
    sql += `CREATE TABLE IF NOT EXISTS ${TABLE} (
  year INT,
  make TEXT,
  model TEXT,
  trim TEXT,
  engine TEXT,
  transmission TEXT
);\n\n`;
  }

  sql += `INSERT INTO ${TABLE} (${COLUMNS.join(", ")}) VALUES\n`;
  sql += rows.join(",\n");
  sql += ";\n";

  const file = chunkFileName(chunkIndex);
  fs.writeFileSync(file, sql, "utf8");
  console.log(`✅ Wrote ${file} (${rows.length} rows)`);
  rows = [];
  chunkIndex += 1;
}

// ---- Convert CSV -> chunked SQL ----
ensureDir(OUT_DIR);
fs.createReadStream(INPUT_CSV)
  .pipe(csv())
  .on("data", (row) => {
    const values = [
      numOrNull(row.year),
      esc(row.make),
      esc(row.model),
      esc(row.trim),
      esc(row.engine),
      esc(row.transmission),
    ];
    rows.push(`(${values.join(", ")})`);
    if (rows.length >= CHUNK_ROWS) writeChunk();
  })
  .on("end", () => {
    writeChunk();
    console.log("🎉 All chunks written to:", OUT_DIR);
  })
  .on("error", (e) => {
    console.error("❌ Failed to read CSV:", e);
    process.exit(1);
  });
