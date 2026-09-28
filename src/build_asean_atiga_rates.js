#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { rawFileExists, readRawText } = require("./lib/raw_file");

// CLI Arguments
const args = process.argv.slice(2);
let baseDir = "./src/raw-data";
let outputDir = "./output/asean_json";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "-b" || args[i] === "--base-dir") baseDir = args[++i];
  else if (args[i] === "-o" || args[i] === "--output-dir")
    outputDir = args[++i];
  else if (args[i] === "-h" || args[i] === "--help") {
    console.log(`
Usage:
  node build_asean_atiga_rates.js [-b <raw-data-folder>] [-o <output-folder>]

Default:
  -b ./src/raw-data
  -o ./output/asean_json
    `);
    process.exit(0);
  }
}

const resolvedBaseDir = path.resolve(process.cwd(), baseDir);
const resolvedOutputDir = path.resolve(process.cwd(), outputDir);

const dutyFile = path.join(resolvedBaseDir, "REFDRT_Open_20220101.txt");
const tariffFile = path.join(resolvedBaseDir, "REFTRC_Open.txt");
const prvFile = path.join(resolvedBaseDir, "REFPRV_Open.txt");

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

// ASEAN Privilege Code Definitions
const ASEAN_SCHEMES = {
  ATG: {
    title_th: "ATG : อาเซียน",
    title_en: "ATG : ASEAN (ATIGA)",
    default_has_condition: true,
    condition_note_th:
      "ต้องตรวจสอบอัตราอากรภายใต้ความตกลงการค้าสินค้าของอาเซียนสำหรับของประเภทหรือชนิดเดียวกันในประเทศผู้ส่งออก ต้องไม่เกินอัตราตามราคาร้อยละยี่สิบ(20%)",
    condition_note_en:
      "Must verify duty rate under ATIGA for the same item in the exporting country, must not exceed 20%",
  },
  ASC: {
    title_th:
      "ASC : รหัสสิทธิพิเศษ ASC สำหรับกรณีที่ผู้นำของเข้าแสดงเอกสารตามข้อ 4 (1) (ก) (ข) (ค) ของประกาศกระทรวงการคลังฯ ฉบับที่ 2",
    title_en:
      "ASC : Special Scheme under Ministry of Finance Notification Clause 4(1)(a)(b)(c) No.2",
    default_has_condition: false,
    condition_note_th: null,
    condition_note_en: null,
  },
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

// 2. ASEAN Duty Rates (REFDRT - ATG / ASC)
console.log(
  `==> [2/2] Filtering ASEAN (ATG / ASC) records from REFDRT...`,
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

const aseanMap = new Map();

for (let i = 0; i < drtLines.length; i++) {
  const line = drtLines[i];

  const hsCode = line.substring(4, 12).trim();
  const tariffSeqStr = line.substring(12, 17).trim();
  const tariffSeq = parseInt(tariffSeqStr, 10) || 0;
  const privilegeCode = line.substring(17, 20).trim();

  // Check for ATG and ASC
  if (!ASEAN_SCHEMES[privilegeCode]) continue;

  // Ad Valorem Rate (Byte 21..45)
  const rateChunk = line.substring(21, 45);
  const adValoremMatch = rateChunk.match(/(\d{1,3}\.\d{2,3})/);
  const adValoremRate = adValoremMatch ? parseFloat(adValoremMatch[1]) : 0.0;

  // Specific Duty Rate (Byte 45..65)
  const specificChunk = line.substring(45, 65);
  const specificMatch = specificChunk.match(/(\d{1,4}\.\d{2,3})/);
  const specificRate = specificMatch ? parseFloat(specificMatch[1]) : 0.0;

  // Specific Unit Code
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

  const schemeMeta = ASEAN_SCHEMES[privilegeCode];

  // ** Check for conditions (ATG includes ** by default; also check whether the line contains condition text)
  const hasCondition =
    schemeMeta.default_has_condition ||
    line.includes("ต้องตรวจสอบ") ||
    line.includes("เงื่อนไข");

  const desc = descriptionMap.get(hsCode) || {
    th: "- - รายการตามพิกัด",
    en: "- - Tariff Item Description",
  };
  const formattedHs = `${hsCode.substring(0, 4)}.${hsCode.substring(4, 8)}00`;

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
    privilege_code: privilegeCode,
    scheme_title: {
      th: schemeMeta.title_th,
      en: schemeMeta.title_en,
    },
    description: { th: desc.th, en: desc.en },
    duty_rate: {
      ad_valorem_percentage: adValoremRate,
      specific_rate_baht: specificRate,
      specific_unit: unitInfo,
      is_exempt: isExempt,
      has_condition: hasCondition,
      display_th: displayTh,
      display_en: displayEn,
    },
    condition_note: {
      th: hasCondition ? schemeMeta.condition_note_th : null,
      en: hasCondition ? schemeMeta.condition_note_en : null,
    },
    legal_notification: {
      th: "ม.14 ATIGA(อาเซียน 2565)",
      en: "Sec.14 ATIGA (ASEAN 2022)",
    },
    effective_date: formatBilingualDate(rawStartDate),
    expiry_date: formatBilingualDate(rawEndDate),
    _is_active: isActiveCurrently,
    _start_int: startInt,
  };

  const groupKey = `${hsCode}_${privilegeCode}`;

  if (!aseanMap.has(groupKey)) {
    aseanMap.set(groupKey, record);
  } else {
    const existing = aseanMap.get(groupKey);
    if (!existing._is_active && record._is_active) {
      aseanMap.set(groupKey, record);
    } else if (existing._is_active && record._is_active) {
      if (record._start_int >= existing._start_int) {
        aseanMap.set(groupKey, record);
      }
    } else if (!existing._is_active && !record._is_active) {
      if (tariffSeq > parseInt(existing.tariff_seq, 10)) {
        aseanMap.set(groupKey, record);
      }
    }
  }
}

// Clean internal fields and sort
const aseanRecords = Array.from(aseanMap.values())
  .map((r) => {
    const { _is_active, _start_int, ...clean } = r;
    return clean;
  })
  .sort(
    (a, b) =>
      a.raw_hs_code.localeCompare(b.raw_hs_code) ||
      a.privilege_code.localeCompare(b.privilege_code),
  );

// Grouped by HS Code
const aseanByHs = {};
aseanRecords.forEach((r) => {
  if (!aseanByHs[r.raw_hs_code]) aseanByHs[r.raw_hs_code] = [];
  aseanByHs[r.raw_hs_code].push(r);
});

// Write JSON output
fs.writeFileSync(
  path.join(resolvedOutputDir, "asean_atiga_full_list.json"),
  JSON.stringify(aseanRecords, null, 2),
  "utf8",
);
fs.writeFileSync(
  path.join(resolvedOutputDir, "asean_atiga_by_hscode.json"),
  JSON.stringify(aseanByHs, null, 2),
  "utf8",
);

console.log(`\n======================================================`);
console.log(
  `==> ASEAN (ATIGA) data extracted successfully: ${resolvedOutputDir}`,
);
console.log(
  `   1. asean_atiga_full_list.json (${aseanRecords.length} records)`,
);
console.log(
  `   2. asean_atiga_by_hscode.json (${Object.keys(aseanByHs).length} HS Codes)`,
);
console.log(`======================================================`);
