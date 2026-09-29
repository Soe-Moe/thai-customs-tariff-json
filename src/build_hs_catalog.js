#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { rawFileExists, readRawText } = require("./lib/raw_file");

// Parse CLI arguments
const args = process.argv.slice(2);
let baseDir = "./src/raw-data";
let outputDir = "./output/hs_catalog_json";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "-b" || args[i] === "--base-dir") baseDir = args[++i];
  else if (args[i] === "-o" || args[i] === "--output-dir")
    outputDir = args[++i];
  else if (args[i] === "-h" || args[i] === "--help") {
    console.log(`
Usage:
  node build_hs_catalog.js [-b <raw-data-folder>] [-o <output-folder>]

Default:
  -b ./src/raw-data
  -o ./output/hs_catalog_json
    `);
    process.exit(0);
  }
}

const resolvedBaseDir = path.resolve(process.cwd(), baseDir);
const resolvedOutputDir = path.resolve(process.cwd(), outputDir);

const tariffFile = path.join(resolvedBaseDir, "REFTRC_Open.txt");
const dutyFile = path.join(resolvedBaseDir, "REFDRT_Open_20220101.txt");

if (!rawFileExists(tariffFile)) {
  console.error(`Error: File not found: ${tariffFile}(.gz)`);
  process.exit(1);
}

if (!fs.existsSync(resolvedOutputDir)) {
  fs.mkdirSync(resolvedOutputDir, { recursive: true });
}

// Unit Mapping
const UNIT_MAP = {
  KGM: { th: "กิโลกรัม", en: "Kilogram" },
  LTR: { th: "ลิตร", en: "Litre" },
  MTR: { th: "เมตร", en: "Metre" },
  NMB: { th: "จำนวน", en: "Number / Units" },
  C62: { th: "ตัว / หน่วย", en: "Head / Pieces" },
  TNE: { th: "ตัน", en: "Tonne" },
};

function formatBilingualDate(dateStr) {
  if (!dateStr || dateStr === "99999999") {
    return { iso: null, th: "เป็นต้นไป", en: "Indefinite / Ongoing" };
  }
  const yyyy = parseInt(dateStr.substring(0, 4), 10);
  const mm = dateStr.substring(4, 6);
  const dd = dateStr.substring(6, 8);
  return {
    iso: `${yyyy}-${mm}-${dd}`,
    th: `${dd}/${mm}/${yyyy + 543}`,
    en: `${dd}/${mm}/${yyyy}`,
  };
}

// REFTRC has no dash indents, so derive them from the HS code structure:
//   Subheading (digits 5-6): "00" = not subdivided (0), "x0" = one dash (1),
//     "xy" = two dashes (2), under an unnumbered one-dash group (e.g. "- Brazil nuts:")
//   National (digits 7-8): "00" = same line as the subheading, "x0" = +1,
//     "xy" = +2, under an unnumbered group (e.g. "- - - Other:")
function getIndent(rawHs8) {
  const levelOf = (pair) => (pair === "00" ? 0 : pair[1] === "0" ? 1 : 2);
  return levelOf(rawHs8.substring(4, 6)) + levelOf(rawHs8.substring(6, 8));
}

function withIndent(desc, indent) {
  return indent > 0 ? `${"- ".repeat(indent)}${desc}` : desc;
}

// ==========================================
// 1. Read General Duty Rates (REFDRT - Privilege 000)
// ==========================================
// REFDRT fixed-width layout:
//   [4,12)  HS code (8 digits)      [12,17) Tariff sequence
//   [17,20) Privilege code          [20,21) Rate type (P / S / B)
//   [21,39) Ad valorem rate (%)     [39,57) Specific rate (baht per unit)
//   [57,60) Specific rate unit      After the last date pair: product note
const dutyMap = new Map(); // HS code -> list of 000 rate variants
if (rawFileExists(dutyFile)) {
  console.log(`==> [1/2] Reading MFN/General Duty Rates (REFDRT)...`);
  const drtLines = readRawText(dutyFile)
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 30);

  for (let i = 0; i < drtLines.length; i++) {
    const line = drtLines[i];
    if (line.substring(17, 20) !== "000") continue;

    const hsCode = line.substring(4, 12);
    const adValoremRate = parseFloat(line.substring(21, 39)) || 0;
    const specificRate = parseFloat(line.substring(39, 57)) || 0;
    const unitCode = line.substring(57, 60).trim() || null;
    const unit = unitCode ? UNIT_MAP[unitCode] : null;

    // Text after the last date pair narrows the rate to part of the tariff line (e.g. "เฉพาะรากชะเอม")
    const datePairs = [...line.matchAll(/(20\d{6})(20\d{6}|99999999)/g)];
    const lastPair = datePairs[datePairs.length - 1];
    const noteTh = lastPair
      ? line.substring(lastPair.index + lastPair[0].length).trim() || null
      : null;

    if (!dutyMap.has(hsCode)) dutyMap.set(hsCode, []);
    dutyMap.get(hsCode).push({
      tariff_seq: line.substring(12, 17),
      duty_exempt: adValoremRate === 0 && specificRate === 0,
      ad_valorem_percent:
        adValoremRate > 0 ? adValoremRate : specificRate > 0 ? null : 0,
      specific_rate_baht: specificRate > 0 ? specificRate : null,
      specific_unit_th: specificRate > 0 && unit ? unit.th : null,
      specific_unit_en: specificRate > 0 && unit ? unit.en : null,
      note_th: noteTh,
    });
  }

  // Sort variants by tariff sequence; the highest one is the general ("other") rate
  dutyMap.forEach((variants) =>
    variants.sort((a, b) => a.tariff_seq.localeCompare(b.tariff_seq)),
  );
}

// ==========================================
// 2. Read REFTRC and build the Tariff Catalog
// ==========================================
// REFTRC fixed-width layout (6028 chars per line, 8-digit tariff lines only):
//   [4,12)      HS code (8 digits)
//   [12,3012)   Thai description
//   [3012,6012) English description
//   [6012,6020) Effective date      [6020,6028) Expiry date
console.log(`==> [2/2] Extracting tariff lines from REFTRC...`);
const trcLines = readRawText(tariffFile)
  .split(/\r?\n/)
  .filter((line) => line.trim().length > 10);

const catalogMap = new Map();

for (let i = 0; i < trcLines.length; i++) {
  const line = trcLines[i];
  const rawHs8 = line.substring(4, 12);
  if (!/^\d{8}$/.test(rawHs8) || catalogMap.has(rawHs8)) continue;

  const indent = getIndent(rawHs8);
  const variants = dutyMap.get(rawHs8) || [];
  const general = variants[variants.length - 1] || {
    duty_exempt: false,
    ad_valorem_percent: null,
    specific_rate_baht: null,
    specific_unit_th: null,
    specific_unit_en: null,
  };

  catalogMap.set(rawHs8, {
    hs_code: `${rawHs8.substring(0, 4)}.${rawHs8.substring(4, 6)}.${rawHs8.substring(6, 8)}`,
    raw_code: rawHs8,
    chapter: rawHs8.substring(0, 2),
    heading: `${rawHs8.substring(0, 2)}.${rawHs8.substring(2, 4)}`,
    subheading: `${rawHs8.substring(0, 4)}.${rawHs8.substring(4, 6)}`,
    indent: indent,
    description_th: withIndent(line.substring(12, 3012).trim(), indent),
    description_en: withIndent(line.substring(3012, 6012).trim(), indent),
    effective_date: formatBilingualDate(line.substring(6012, 6020).trim()),
    expiry_date: formatBilingualDate(line.substring(6020, 6028).trim()),
    duty_exempt: general.duty_exempt,
    ad_valorem_percent: general.ad_valorem_percent,
    specific_rate_baht: general.specific_rate_baht,
    specific_unit_th: general.specific_unit_th,
    specific_unit_en: general.specific_unit_en,
    // Only present when the 000 rate is split by product (e.g. one part exempt, the rest 10%)
    ...(variants.length > 1 && { duty_rate_variants: variants }),
  });
}

const catalogList = [...catalogMap.values()].sort((a, b) =>
  a.raw_code.localeCompare(b.raw_code),
);

// Group by chapter
const catalogByChapter = {};
catalogList.forEach((item) => {
  if (!catalogByChapter[item.chapter]) {
    catalogByChapter[item.chapter] = [];
  }
  catalogByChapter[item.chapter].push(item);
});

// Write JSON output
fs.writeFileSync(
  path.join(resolvedOutputDir, "hs_catalog_full_list.json"),
  JSON.stringify(catalogList, null, 2),
  "utf8",
);

fs.writeFileSync(
  path.join(resolvedOutputDir, "hs_catalog_by_chapter.json"),
  JSON.stringify(catalogByChapter, null, 2),
  "utf8",
);

const withoutDuty = catalogList.filter((item) => !dutyMap.has(item.raw_code));

console.log(`\n======================================================`);
console.log(`==> HS Catalog written to: ${resolvedOutputDir}`);
console.log(
  `   1. hs_catalog_full_list.json   (${catalogList.length} tariff lines)`,
);
console.log(
  `   2. hs_catalog_by_chapter.json  (${Object.keys(catalogByChapter).length} Chapters)`,
);
console.log(`   Tariff lines without a 000 duty rate: ${withoutDuty.length}`);
console.log(`======================================================`);
