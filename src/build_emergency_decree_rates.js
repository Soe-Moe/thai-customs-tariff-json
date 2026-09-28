#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { rawFileExists, readRawText } = require("./lib/raw_file");

// CLI Arguments
const args = process.argv.slice(2);
let baseDir = "./src/raw-data";
let outputDir = "./output/emergency_decree_json";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "-b" || args[i] === "--base-dir") baseDir = args[++i];
  else if (args[i] === "-o" || args[i] === "--output-dir")
    outputDir = args[++i];
  else if (args[i] === "-h" || args[i] === "--help") {
    console.log(`
Usage:
  node build_emergency_decree_rates.js [-b <raw-data-folder>] [-o <output-folder>]

Default:
  -b ./src/raw-data
  -o ./output/emergency_decree_json
    `);
    process.exit(0);
  }
}

const resolvedBaseDir = path.resolve(process.cwd(), baseDir);
const resolvedOutputDir = path.resolve(process.cwd(), outputDir);

const dutyFile = path.join(resolvedBaseDir, "REFDRT_Open_20220101.txt");
const tariffFile = path.join(resolvedBaseDir, "REFTRC_Open.txt");

if (!rawFileExists(dutyFile) || !rawFileExists(tariffFile)) {
  console.error(`Error: Required files are missing in ${resolvedBaseDir}`);
  process.exit(1);
}

if (!fs.existsSync(resolvedOutputDir)) {
  fs.mkdirSync(resolvedOutputDir, { recursive: true });
}

const CURRENT_DATE_INT = 20260928;

const UNIT_MAP = {
  KGM: { th: "กิโลกรัม", en: "Kilogram" },
  LTR: { th: "ลิตร", en: "Litre" },
  NMB: { th: "จำนวน", en: "Number / Units" },
  TNE: { th: "ตัน", en: "Tonne" },
};

// 1. Goods Descriptions (REFTRC)
console.log(`==> [1/2] Reading Descriptions (REFTRC)...`);
const trcText = readRawText(tariffFile);
const trcLines = trcText
  .split(/\r?\n/)
  .filter((line) => line.trim().length > 10);
const descriptionMap = new Map();

for (let i = 0; i < trcLines.length; i++) {
  const line = trcLines[i];
  const hsMatch = line.match(/^(\d{8,11})/);
  if (!hsMatch) continue;

  const rawHs = hsMatch[1];
  const hs8 = rawHs.substring(0, 8);
  const hs10 = rawHs.length >= 10 ? rawHs.substring(0, 10) : hs8;

  const thaiMatches = line.match(/([\u0E00-\u0E7F\s\-()–—.+%/]+)/g);
  let descTh = thaiMatches
    ? thaiMatches
        .map((s) => s.trim())
        .filter((s) => s.length > 1)
        .join(" ")
        .trim()
    : "";

  const engMatches = line.match(/([a-zA-Z\s\-(),.+%/]{3,})/g);
  let descEn = engMatches
    ? engMatches
        .map((s) => s.trim())
        .filter((s) => s.length > 2)
        .join(" ")
        .trim()
    : "";

  const descObj = {
    th: descTh || "- - ไม่ระบุรายการ",
    en: descEn || "- - Unspecified",
  };
  descriptionMap.set(hs10, descObj);
  if (!descriptionMap.has(hs8)) descriptionMap.set(hs8, descObj);
}

// 2. Emergency Decree Duty Rates (REFDRT - Privilege Code 999)
console.log(
  `==> [2/2] Filtering Emergency Decree (999) records from REFDRT...`,
);
const drtText = readRawText(dutyFile);
const drtLines = drtText
  .split(/\r?\n/)
  .filter((line) => line.trim().length > 30);

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

const emergencyDecreeMap = new Map();

for (let i = 0; i < drtLines.length; i++) {
  const line = drtLines[i];

  const hsCode = line.substring(4, 12).trim();
  const tariffSeqStr = line.substring(12, 17).trim();
  const tariffSeq = parseInt(tariffSeqStr, 10) || 0;
  const privilegeCode = line.substring(17, 20).trim();

  // The Privilege Code for the Emergency Decree (maximum ceiling rate) is 999
  if (privilegeCode !== "999") continue;

  // Ad Valorem Rate (Byte 21..45) -> 60.000
  const rateChunk = line.substring(21, 45);
  const adValoremMatch = rateChunk.match(/(\d{1,3}\.\d{2,3})/);
  const adValoremRate = adValoremMatch ? parseFloat(adValoremMatch[1]) : 0.0;

  // Specific Duty Rate (Byte 45..65) -> 50.000
  const specificChunk = line.substring(45, 65);
  const specificMatch = specificChunk.match(/(\d{1,4}\.\d{2,3})/);
  const specificRate = specificMatch ? parseFloat(specificMatch[1]) : 0.0;

  // Specific Unit Code -> KGM
  const unitMatch = line.substring(55, 75).match(/\b(KGM|LTR|NMB|TNE)\b/);
  const unitCode = unitMatch ? unitMatch[1] : "";
  const unitInfo = UNIT_MAP[unitCode] || {
    th: unitCode || "-",
    en: unitCode || "-",
  };

  // Find the 16-digit date pair
  const allDatePairs = [...line.matchAll(/(20\d{6})(20\d{6}|99999999)/g)];
  let rawStartDate = "20220101";
  let rawEndDate = "99999999";

  if (allDatePairs.length > 0) {
    const lastPair = allDatePairs[allDatePairs.length - 1];
    rawStartDate = lastPair[1];
    rawEndDate = lastPair[2];
  }

  const startInt = parseInt(rawStartDate, 10);
  const endInt = parseInt(rawEndDate, 10);
  const isActiveCurrently =
    CURRENT_DATE_INT >= startInt && CURRENT_DATE_INT <= endInt;

  // ** Check for conditions
  const hasCondition =
    line.includes("ต้องตรวจสอบ") ||
    line.includes("ท้ายประกาศ") ||
    line.includes("เงื่อนไข");

  // Legal Reference (Emergency Decree No. 7, B.E. 2565 / 2022)
  let legalRefTh = "พรก. ฉบับที่ 7 พ.ศ. 2565";
  const issueMatch = line.match(/(ฉบับที่\s*\d+)/);
  if (issueMatch) {
    legalRefTh = `พรก. ${issueMatch[1]} พ.ศ. 2565`;
  }

  const desc = descriptionMap.get(hsCode) || {
    th: "- - รายการตามพิกัด",
    en: "- - Tariff Item Description",
  };

  const formattedHs = `${hsCode.substring(0, 4)}.${hsCode.substring(4, 6)}.${hsCode.substring(6, 8)}`;
  const isExempt = adValoremRate === 0 && specificRate === 0;
  const rateText =
    adValoremRate % 1 === 0
      ? `${adValoremRate.toFixed(3)}`
      : `${adValoremRate}`;

  const displayTh = isExempt
    ? hasCondition
      ? "** ยกเว้นอากร"
      : "ยกเว้นอากร"
    : hasCondition
      ? `** ${rateText}`
      : `${rateText}`;
  const displayEn = isExempt
    ? hasCondition
      ? "** Duty Exempted"
      : "Duty Exempted"
    : hasCondition
      ? `** ${rateText}%`
      : `${rateText}%`;

  const record = {
    heading: hsCode.substring(0, 4).replace(/(\d{2})(\d{2})/, "$1.$2"),
    tariff_code: formattedHs,
    raw_hs_code: hsCode,
    tariff_seq: tariffSeqStr,
    privilege_code: "999",
    scheme_title: {
      th: "999 : อัตราอากรตามภาค 2 แห่ง พรก. 2530 (อัตราเพดานสูงสุด)",
      en: "999 : Emergency Decree on Customs Tariff B.E. 2530 (Part 2 Ceiling Rates)",
    },
    description: {
      th: desc.th,
      en: desc.en,
    },
    duty_rate: {
      ad_valorem_percentage: adValoremRate,
      specific_rate_baht: specificRate,
      specific_unit: unitInfo,
      is_exempt: isExempt,
      has_condition: hasCondition,
      display_th: displayTh,
      display_en: displayEn,
    },
    legal_notification: {
      th: legalRefTh,
      en: "Emergency Decree No. 7 (2022)",
    },
    effective_date: formatBilingualDate(rawStartDate),
    expiry_date: formatBilingualDate(rawEndDate),
    _is_active: isActiveCurrently,
    _start_int: startInt,
  };

  const groupKey = `${hsCode}_999`;

  if (!emergencyDecreeMap.has(groupKey)) {
    emergencyDecreeMap.set(groupKey, record);
  } else {
    const existing = emergencyDecreeMap.get(groupKey);
    if (!existing._is_active && record._is_active) {
      emergencyDecreeMap.set(groupKey, record);
    } else if (existing._is_active && record._is_active) {
      if (record._start_int >= existing._start_int) {
        emergencyDecreeMap.set(groupKey, record);
      }
    } else if (!existing._is_active && !record._is_active) {
      if (tariffSeq > parseInt(existing.tariff_seq, 10)) {
        emergencyDecreeMap.set(groupKey, record);
      }
    }
  }
}

// Clean internal fields and sort
const records = Array.from(emergencyDecreeMap.values())
  .map((r) => {
    const { _is_active, _start_int, ...clean } = r;
    return clean;
  })
  .sort((a, b) => a.raw_hs_code.localeCompare(b.raw_hs_code));

// Grouped by HS Code
const groupedByHs = {};
records.forEach((r) => {
  if (!groupedByHs[r.raw_hs_code]) groupedByHs[r.raw_hs_code] = [];
  groupedByHs[r.raw_hs_code].push(r);
});

// Write JSON output
fs.writeFileSync(
  path.join(resolvedOutputDir, "emergency_decree_full_list.json"),
  JSON.stringify(records, null, 2),
  "utf8",
);
fs.writeFileSync(
  path.join(resolvedOutputDir, "emergency_decree_by_hscode.json"),
  JSON.stringify(groupedByHs, null, 2),
  "utf8",
);

console.log(`\n======================================================`);
console.log(
  `==> Emergency Decree (999) data extracted successfully: ${resolvedOutputDir}`,
);
console.log(
  `   1. emergency_decree_full_list.json (${records.length} records)`,
);
console.log(
  `   2. emergency_decree_by_hscode.json (${Object.keys(groupedByHs).length} HS Codes)`,
);
console.log(`======================================================`);
