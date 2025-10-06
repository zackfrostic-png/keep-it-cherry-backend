// generateVehicleCatalog.js
// Builds a master CSV from the public NHTSA API for years 1950–2025.
// NOTE: NHTSA provides make/model (by year), but does NOT provide trim/engine/transmission.
// Those columns are included (blank) so your database schema is future-proof.

const fs = require("fs");
const path = require("path");

// ---- Config ----
const START_YEAR = 1950;
const END_YEAR = 2025;
const OUTPUT_FILE = path.join(__dirname, "vehicle_catalog_master.csv");

// Small delay between requests to be polite to the API
const SLEEP_MS = 120;

// Use Node 18+ global fetch; if older Node, install node-fetch.
async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Simple CSV escape
function csvEscape(s) {
  if (s == null) return "";
  const str = String(s);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Fetch JSON helper with retry
async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(300 + i * 300);
    }
  }
}

// NHTSA: list all makes (not per year)
async function getAllMakes() {
  const url = "https://vpic.nhtsa.dot.gov/api/vehicles/getallmakes?format=json";
  const data = await getJson(url);
  return (data?.Results || []).map((r) => r.Make_Name).filter(Boolean);
}

// NHTSA: models for a given make and year
async function getModelsForMakeYear(make, year) {
  // https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/{make}/modelyear/{year}?format=json
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(
    make
  )}/modelyear/${year}?format=json`;
  const data = await getJson(url);
  const results = data?.Results || [];
  // The API returns objects with Model_Name; sometimes duplicates—dedupe case-insensitively.
  const seen = new Set();
  const models = [];
  for (const r of results) {
    const m = (r?.Model_Name || "").trim();
    if (!m) continue;
    const key = m.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      models.push(m);
    }
  }
  return models;
}

async function main() {
  console.log("🚀 Building master vehicle catalog CSV from NHTSA…");
  console.log(`📆 Years: ${START_YEAR}–${END_YEAR}`);

  // Prepare writer and header
  const out = fs.createWriteStream(OUTPUT_FILE, { encoding: "utf8" });
  out.write("year,make,model,trim,engine,transmission\n"); // trim/engine/transmission left blank

  // Get all makes once
  console.log("📥 Fetching all makes list…");
  const allMakes = await getAllMakes();
  console.log(`✅ Found ${allMakes.length} makes.`);

  let rowCount = 0;
  // To reduce useless calls for obscure makes in very early years, we’ll still attempt all;
  // NHTSA will just return 0 results for years/models that don’t exist.
  for (let year = END_YEAR; year >= START_YEAR; year--) {
    console.log(`\n📆 Year ${year}: querying models for all makes…`);
    for (let i = 0; i < allMakes.length; i++) {
      const make = allMakes[i];
      try {
        const models = await getModelsForMakeYear(make, year);
        if (models.length) {
          for (const model of models) {
            // Write CSV row; leave trim/engine/transmission blank for now
            const row = [
              csvEscape(year),
              csvEscape(make),
              csvEscape(model),
              "", // trim
              "", // engine
              "", // transmission
            ].join(",");
            out.write(row + "\n");
            rowCount++;
          }
        }
      } catch (e) {
        // Non-fatal; continue
        console.warn(`⚠️  ${year} ${make}: ${e.message}`);
      }
      // Polite delay
      await sleep(SLEEP_MS);
      // Progress log every ~50 makes
      if (i % 50 === 0) {
        process.stdout.write(
          `   … ${make} (${i + 1}/${allMakes.length}) | total rows: ${rowCount}\r`
        );
      }
    }
  }

  out.end();
  await new Promise((r) => out.on("finish", r));
  console.log(`\n✅ Done! Wrote ${rowCount.toLocaleString()} rows to ${OUTPUT_FILE}`);
  console.log("ℹ️  Note: trim/engine/transmission are blank (NHTSA doesn’t provide them). We can enrich later.");
}

main().catch((e) => {
  console.error("❌ Failed:", e);
  process.exit(1);
});
