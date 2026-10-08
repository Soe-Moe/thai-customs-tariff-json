#!/usr/bin/env node

const path = require("path");
const { parseArgs } = require("./lib/cli");
const {
  RAW_FILES,
  rawFileExists,
  readRawText,
  requireRawFiles,
} = require("./lib/raw_file");
const { formatBilingualDate } = require("./lib/dates");
const { UNIT_MAP, readDutyLines } = require("./lib/duty_rates");
const { writeJsonFiles, groupBy } = require("./lib/output");
const {
  getIndent,
  withIndent,
  parseLineNote,
  createTariffLineResolver,
} = require("./lib/tariff_lines");

const { baseDir, outputDir } = parseArgs("build_hs_catalog.js", {
  baseDir: "./src/raw-data",
  outputDir: "./output/hs_catalog_json",
});
const { tariff: tariffFile } = requireRawFiles(baseDir, ["tariff"]);
const dutyFile = path.join(baseDir, RAW_FILES.duty);

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
  const tariffLines = createTariffLineResolver(baseDir, { tariff: tariffFile, duty: dutyFile });
  console.log(`==> [1/2] Reading MFN/General Duty Rates (REFDRT)...`);
  for (const line of readDutyLines(dutyFile)) {
    if (line.substring(17, 20) !== "000") continue;

    const hsCode = line.substring(4, 12);
    const adValoremRate = parseFloat(line.substring(21, 39)) || 0;
    const specificRate = parseFloat(line.substring(39, 57)) || 0;
    const unitCode = line.substring(57, 60).trim() || null;
    const unit = unitCode ? UNIT_MAP[unitCode] : null;

    // Text after the last date pair narrows the rate to part of the tariff line (e.g. "เฉพาะรากชะเอม")
    const noteTh = parseLineNote(line) || null;

    const tariffLine = tariffLines.resolve(hsCode, "000", noteTh);
    if (!tariffLine) continue;

    if (!dutyMap.has(hsCode)) dutyMap.set(hsCode, []);
    dutyMap.get(hsCode).push({
      tariff_code: tariffLine.tariff_code,
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

const catalogByChapter = groupBy(catalogList, "chapter");

writeJsonFiles(outputDir, {
  "hs_catalog_full_list.json": catalogList,
  "hs_catalog_by_chapter.json": catalogByChapter,
});

const withoutDuty = catalogList.filter((item) => !dutyMap.has(item.raw_code));

console.log(`\n======================================================`);
console.log(`==> HS Catalog written to: ${outputDir}`);
console.log(
  `   1. hs_catalog_full_list.json   (${catalogList.length} tariff lines)`,
);
console.log(
  `   2. hs_catalog_by_chapter.json  (${Object.keys(catalogByChapter).length} Chapters)`,
);
console.log(`   Tariff lines without a 000 duty rate: ${withoutDuty.length}`);
console.log(`======================================================`);
