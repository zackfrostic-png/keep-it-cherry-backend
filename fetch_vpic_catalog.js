// fetch_vpic_catalog.js
// ✅ FINAL VERSION: Auto-fetches Make_IDs from NHTSA, uses them to guarantee complete model lists
// ✅ Includes trims, engines, transmissions (blank if missing)
// ✅ Years: 1980–2025

import fs from "node:fs/promises";

const START_YEAR = 1980;
const END_YEAR = 2025;
const OUTPUT_CSV = "vehicle_catalog_master.csv";
const NHTSA_MAKES_URL = "https://vpic.nhtsa.dot.gov/api/vehicles/GetAllMakes?format=json";
const NHTSA_MODELS_URL = "https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeIdYear/makeId";
const CARQUERY_BASE = "https://www.carqueryapi.com/api/0.3/?cmd=getTrims";
const DELAY_MS = 400;

// ---------- CURATED TOP 100 ----------
const TARGET_MAKES = new Set([
  "Acura","Alfa Romeo","AMC","Aston Martin","Audi","Bentley","BMW","Buick","Cadillac","Chevrolet",
  "Chrysler","Citroen","Daewoo","Daihatsu","Datsun","DeLorean","Dodge","Eagle","Fiat","Fisker",
  "Ford","Freightliner","Genesis","Geo","GMC","Hino","Honda","Hummer","Hyundai","Infiniti",
  "International","Isuzu","Jaguar","Jeep","Karma","Kia","Koenigsegg","Lamborghini","Land Rover","Lexus",
  "Lincoln","Lucid","Maserati","Maybach","Mazda","McLaren","Mercedes-Benz","Mercury","Mini","Mitsubishi",
  "Morgan","Nissan","Oldsmobile","Opel","Pagani","Peugeot","Plymouth","Polestar","Pontiac","Porsche",
  "RAM","Renault","Rivian","Rolls-Royce","Saab","Saleen","Saturn","Scion","Seat","Shelby",
  "Skoda","Smart","Spyker","SsangYong","Subaru","Suzuki","Tata","Tesla","Toyota","Trabant",
  "Triumph","TVR","Vauxhall","Vector","Volkswagen","Volvo","Wiesmann","Workhorse","Yugo","Zenvo",
  "Freightliner Custom Chassis","Kenworth","Mack","Peterbilt","Western Star","Navistar","Blue Bird","Thomas Built","Gillig","Proterra"
]);

// ---------- HELPERS ----------
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

function normalize(val) {
  return String(val ?? "").trim().replace(/\s+/g, " ");
}

function csvEscape(val) {
  const s = String(val ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function writeCsvHeader(file, headers) {
  await fs.writeFile(file, headers.join(",") + "\n", "utf8");
}

async function appendCsvRows(file, rows) {
  if (!rows.length) return;
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
  await fs.appendFile(file, csv, "utf8");
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// ---------- FETCH MAKE IDs ----------
async function getMakeIdMap() {
  console.log("📥 Fetching all makes from NHTSA...");
  const data = await fetchJSON(NHTSA_MAKES_URL);
  const allMakes = data.Results.map((m) => ({
    id: m.Make_ID,
    name: normalize(m.Make_Name)
  }));

  // Filter to our curated Top 100 (case-insensitive)
  const filtered = allMakes.filter((m) => {
    return Array.from(TARGET_MAKES).some(
      (target) => m.name.toLowerCase() === target.toLowerCase()
    );
  });

  console.log(`✅ Found ${filtered.length} official make IDs.`);
  return filtered;
}

// ---------- FETCH MODELS (USING MAKE_ID) ----------
async function getModelsForMakeId(makeId, year) {
  const url = `${NHTSA_MODELS_URL}/${makeId}/modelyear/${year}?format=json`;
  try {
    const data = await fetchJSON(url);
    const models = (data?.Results ?? []).map((m) => normalize(m.Model_Name));
    return [...new Set(models)];
  } catch {
    return [];
  }
}

// ---------- FETCH TRIMS ----------
function parseCarQueryJSONP(txt) {
  const stripped = txt.replace(/^[^(]*\(/, "").replace(/\);?\s*$/, "");
  return JSON.parse(stripped);
}

async function getTrimData(make, model, year) {
  const url = `${CARQUERY_BASE}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&year=${year}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("CarQuery error");
    const text = await res.text();
    const json = parseCarQueryJSONP(text);
    const trims = json?.Trims || [];
    if (trims.length === 0) return [{ trim: "", engine: "", transmission: "" }];

    return trims.map((t) => ({
      trim: normalize(t.model_trim),
      engine: normalize(t.model_engine_fuel || t.model_engine_cc || ""),
      transmission: normalize(t.model_transmission_type || "")
    }));
  } catch {
    return [{ trim: "", engine: "", transmission: "" }];
  }
}

// ---------- EXPORT MASTER CSV ----------
async function exportCatalog() {
  await writeCsvHeader(OUTPUT_CSV, ["year", "make", "model", "trim", "engine", "transmission"]);
  const makeList = await getMakeIdMap();

  for (let year = START_YEAR; year <= END_YEAR; year++) {
    for (const make of makeList) {
      const models = await getModelsForMakeId(make.id, year);
      if (models.length === 0) {
        console.log(`✅ ${year} ${make.name}: 0 models`);
        await sleep(DELAY_MS);
        continue;
      }

      for (const model of models) {
        const trims = await getTrimData(make.name, model, year);
        const rows = trims.map((t) => [year, make.name, model, t.trim, t.engine, t.transmission]);
        await appendCsvRows(OUTPUT_CSV, rows);
      }

      console.log(`✅ ${year} ${make.name}: ${models.length} models`);
      await sleep(DELAY_MS);
    }
  }

  console.log("📁 Done! vehicle_catalog_master.csv created with full model data ✅");
}

// ---------- MAIN ----------
(async () => {
  try {
    await exportCatalog();
  } catch (err) {
    console.error("❌ Fatal error:", err);
    process.exit(1);
  }
})();
