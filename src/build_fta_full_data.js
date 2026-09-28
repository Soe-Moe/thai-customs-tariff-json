#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { readRawText } = require("./lib/raw_file");

const args = process.argv.slice(2);
let baseDir = "./src/raw-data";
let outputDir = "./output/fta_json";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "-b" || args[i] === "--base-dir") baseDir = args[++i];
  else if (args[i] === "-o" || args[i] === "--output-dir")
    outputDir = args[++i];
}

const resolvedBaseDir = path.resolve(process.cwd(), baseDir);
const resolvedOutputDir = path.resolve(process.cwd(), outputDir);
const patchesDir = path.join(resolvedBaseDir, "patches");

const dutyFile = path.join(resolvedBaseDir, "REFDRT_Open_20220101.txt");
const tariffFile = path.join(resolvedBaseDir, "REFTRC_Open.txt");
const prvFile = path.join(resolvedBaseDir, "REFPRV_Open.txt");

if (!fs.existsSync(resolvedOutputDir)) {
  fs.mkdirSync(resolvedOutputDir, { recursive: true });
}

const CURRENT_DATE_INT = 20260928;

// 1. Goods Descriptions (REFTRC)
console.log(`==> [1/3] Reading Descriptions...`);
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

// 2. Read Duty Rates (REFDRT)
console.log(`==> [2/3] Reading Duty Rates and checking 2026 validity...`);
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

const MULTI_CODES = new Set([
  "AAN",
  "AA1",
  "AA2",
  "ACN",
  "AC1",
  "AC2",
  "AHK",
  "AH1",
  "AH2",
  "AIN",
  "AI1",
  "AI2",
  "AJ1",
  "AJ2",
  "AJ3",
  "AK1",
  "AK2",
  "AK3",
  "R1C",
  "R1D",
  "R2C",
  "R2D",
  "R3C",
  "R3D",
  "R0C",
  "R0D",
]);
const BI_CODES = new Set([
  "TC1",
  "TC2",
  "TJ1",
  "TJ2",
  "TJ3",
  "TAU",
  "TA1",
  "TA2",
  "TNZ",
  "TN1",
  "TN2",
  "TIN",
  "TI1",
  "TI2",
  "TPE",
  "TP1",
  "TP2",
  "TCL",
  "TC3",
]);

const multilateralMap = new Map();
const bilateralMap = new Map();

for (let i = 0; i < drtLines.length; i++) {
  const line = drtLines[i];

  const hsCode = line.substring(4, 12).trim();
  const tariffSeqStr = line.substring(12, 17).trim();
  const tariffSeq = parseInt(tariffSeqStr, 10) || 0;
  const privilegeCode = line.substring(17, 20).trim();

  const isMulti = MULTI_CODES.has(privilegeCode);
  const isBi = BI_CODES.has(privilegeCode);
  if (!isMulti && !isBi) continue;

  const rateChunk = line.substring(21, 58);
  const rateMatch = rateChunk.match(/(\d{1,2}\.\d{2,3})/);
  const dutyRate = rateMatch ? parseFloat(rateMatch[1]) : 0.0;

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

  const hasCondition =
    line.includes("ต้องตรวจสอบ") ||
    line.includes("ท้ายประกาศ") ||
    privilegeCode === "ACN";

  const desc = descriptionMap.get(hsCode) || {
    th: "- - รายการตามพิกัด",
    en: "- - Tariff Item Description",
  };

  const rateFormatted =
    dutyRate % 1 === 0
      ? `${dutyRate}%`
      : `${dutyRate.toFixed(3).replace(/\.?0+$/, "")}%`;
  const displayRateTextTh =
    dutyRate === 0
      ? hasCondition
        ? "** ยกเว้นอากร"
        : "ยกเว้นอากร"
      : hasCondition
        ? `** ${rateFormatted}`
        : `${rateFormatted}`;
  const displayRateTextEn =
    dutyRate === 0
      ? hasCondition
        ? "** Duty Exempted"
        : "Duty Exempted"
      : hasCondition
        ? `** ${rateFormatted}`
        : `${rateFormatted}`;

  let legalRef = "";
  const refIndex = line.indexOf("ม.14");
  if (refIndex !== -1) {
    const tailPart = line.substring(refIndex);
    const dateIndex = tailPart.search(/\b(20\d{6}|99999999)\b/);
    legalRef = (
      dateIndex !== -1
        ? tailPart.substring(0, dateIndex)
        : tailPart.substring(0, 50)
    ).trim();
  }

  const record = {
    hs_code: hsCode,
    tariff_seq: tariffSeqStr,
    privilege_code: privilegeCode,
    agreement_name: { th: privilegeCode, en: privilegeCode },
    description: { th: desc.th, en: desc.en },
    duty_rate: {
      percentage: dutyRate,
      is_exempt: dutyRate === 0,
      display_th: displayRateTextTh,
      display_en: displayRateTextEn,
    },
    legal_notification: {
      th: legalRef || "ม.14",
      en: `Sec.14 (${privilegeCode})`,
    },
    effective_date: formatBilingualDate(rawStartDate),
    expiry_date: formatBilingualDate(rawEndDate),
    restrictions: {
      has_condition: hasCondition,
      note_th: hasCondition
        ? "ต้องตรวจสอบประเทศที่ได้รับสิทธิ์จากบัญชีท้ายประกาศกระทรวงการคลัง"
        : null,
      note_en: hasCondition
        ? "Country of Origin eligibility must be verified according to Ministry of Finance Notification Annex"
        : null,
    },
    _is_active: isActiveCurrently,
    _start_int: startInt,
  };

  const groupKey = `${hsCode}_${privilegeCode}`;

  function updateTargetMap(targetMap) {
    if (!targetMap.has(groupKey)) {
      targetMap.set(groupKey, record);
    } else {
      const existing = targetMap.get(groupKey);
      if (!existing._is_active && record._is_active) {
        targetMap.set(groupKey, record);
      } else if (existing._is_active && record._is_active) {
        if (record._start_int >= existing._start_int) {
          targetMap.set(groupKey, record);
        }
      } else if (!existing._is_active && !record._is_active) {
        if (tariffSeq > parseInt(existing.tariff_seq, 10)) {
          targetMap.set(groupKey, record);
        }
      }
    }
  }

  if (isMulti) updateTargetMap(multilateralMap);
  if (isBi) updateTargetMap(bilateralMap);
}

// 3. Add the new JTEPA codes (J1E, J1P, J2E, J2P, J3E, J3P) per the 2025 announcement
console.log(`==> [3/3] Merging new 2025 JTEPA codes (J1E, J1P)...`);
const jtepaPatchMeta = {
  J1P: {
    th: "การยกเว้นอากรและลดอัตราอากรสำหรับของที่มีถิ่นกำเนิดจากญี่ปุ่น (บัญชีอัตราอากร 1)",
    en: "Goods Originating in Japan (Schedule 1)",
    base: "TJ1",
  },
  J1E: {
    th: "การยกเว้นอากรและลดอัตราอากรสำหรับของที่มีถิ่นกำเนิดจากญี่ปุ่น (บัญชีอัตราอากร 1) สำหรับอิเล็กทรอนิกส์",
    en: "Goods Originating in Japan (Schedule 1 - Electronics)",
    base: "TJ1",
  },
  J2P: {
    th: "การยกเว้นอากรและลดอัตราอากรสำหรับของที่มีถิ่นกำเนิดจากญี่ปุ่น (บัญชีอัตราอากร 2)",
    en: "Goods Originating in Japan (Schedule 2)",
    base: "TJ2",
  },
  J2E: {
    th: "การยกเว้นอากรและลดอัตราอากรสำหรับของที่มีถิ่นกำเนิดจากญี่ปุ่น (บัญชีอัตราอากร 2) สำหรับอิเล็กทรอนิกส์",
    en: "Goods Originating in Japan (Schedule 2 - Electronics)",
    base: "TJ2",
  },
  J3P: {
    th: "การยกเว้นอากรและลดอัตราอากรสำหรับของที่มีถิ่นกำเนิดจากญี่ปุ่น (บัญชีอัตราอากร 3)",
    en: "Goods Originating in Japan (Schedule 3)",
    base: "TJ3",
  },
  J3E: {
    th: "การยกเว้นอากรและลดอัตราอากรสำหรับของที่มีถิ่นกำเนิดจากญี่ปุ่น (บัญชีอัตราอากร 3) สำหรับอิเล็กทรอนิกส์",
    en: "Goods Originating in Japan (Schedule 3 - Electronics)",
    base: "TJ3",
  },
};

// Generate J1P, J1E, etc. based on the TJ1, TJ2, TJ3 records in Bilateral
const newJtepaRecords = [];
for (const [key, existingRecord] of bilateralMap.entries()) {
  const baseCode = existingRecord.privilege_code; // TJ1, TJ2, etc.

  for (const [newCode, meta] of Object.entries(jtepaPatchMeta)) {
    if (meta.base === baseCode) {
      newJtepaRecords.push({
        hs_code: existingRecord.hs_code,
        tariff_seq: existingRecord.tariff_seq,
        privilege_code: newCode,
        agreement_name: {
          th: meta.th,
          en: meta.en,
        },
        description: existingRecord.description,
        duty_rate: existingRecord.duty_rate,
        legal_notification: {
          th: "JTEPA (2568)",
          en: "JTEPA (2025)",
        },
        effective_date: {
          iso: "2025-06-02",
          th: "02/06/2568",
          en: "02/06/2025",
        },
        expiry_date: {
          iso: null,
          th: "เป็นต้นไป",
          en: "Indefinite / Ongoing",
        },
        restrictions: existingRecord.restrictions,
        _is_active: true,
        _start_int: 20250602,
      });
    }
  }
}

// Merge into the Bilateral Map
newJtepaRecords.forEach((rec) => {
  bilateralMap.set(`${rec.hs_code}_${rec.privilege_code}`, rec);
});

function cleanInternalFields(records) {
  return records.map((r) => {
    const { _is_active, _start_int, ...clean } = r;
    return clean;
  });
}

const multiRecords = cleanInternalFields(
  Array.from(multilateralMap.values()),
).sort(
  (a, b) =>
    a.hs_code.localeCompare(b.hs_code) ||
    a.privilege_code.localeCompare(b.privilege_code),
);
const biRecords = cleanInternalFields(Array.from(bilateralMap.values())).sort(
  (a, b) =>
    a.hs_code.localeCompare(b.hs_code) ||
    a.privilege_code.localeCompare(b.privilege_code),
);

function groupRecordsByHs(records) {
  const grouped = {};
  records.forEach((r) => {
    if (!grouped[r.hs_code]) grouped[r.hs_code] = [];
    grouped[r.hs_code].push(r);
  });
  return grouped;
}

fs.writeFileSync(
  path.join(resolvedOutputDir, "fta_multilateral_full.json"),
  JSON.stringify(multiRecords, null, 2),
  "utf8",
);
fs.writeFileSync(
  path.join(resolvedOutputDir, "fta_bilateral_full.json"),
  JSON.stringify(biRecords, null, 2),
  "utf8",
);
fs.writeFileSync(
  path.join(resolvedOutputDir, "fta_by_hscode_grouped.json"),
  JSON.stringify(
    {
      metadata: {
        generated_at: new Date().toISOString(),
        multilateral_count: multiRecords.length,
        bilateral_count: biRecords.length,
      },
      multilateral: groupRecordsByHs(multiRecords),
      bilateral: groupRecordsByHs(biRecords),
    },
    null,
    2,
  ),
  "utf8",
);

console.log(`==> Completed: ${resolvedOutputDir}`);
console.log(`   - Multilateral Records : ${multiRecords.length}`);
console.log(
  `   - Bilateral Records    : ${biRecords.length} (includes J1E, J1P, TAU)`,
);
