#!/usr/bin/env node

const { parseArgs } = require("./lib/cli");
const { requireRawFiles } = require("./lib/raw_file");
const { formatBilingualDate } = require("./lib/dates");
const {
  loadDescriptionMap,
  getDescription,
} = require("./lib/tariff_descriptions");
const {
  readDutyLines,
  parseDutyKey,
  parseDateRange,
  isActiveOn,
  extractLegalRef,
  formatRatePercent,
  formatDutyDisplay,
  keepPreferredRecord,
  stripInternalFields,
} = require("./lib/duty_rates");
const { writeJsonFiles, groupBy } = require("./lib/output");

const { baseDir, outputDir, date } = parseArgs("build_fta_full_data.js", {
  baseDir: "./src/raw-data",
  outputDir: "./output/fta_json",
  date: null,
});
const files = requireRawFiles(baseDir, ["duty", "tariff"]);

// 1. Goods Descriptions (REFTRC)
console.log(`==> [1/3] Reading Descriptions...`);
const descriptionMap = loadDescriptionMap(files.tariff);

// 2. Read Duty Rates (REFDRT)
console.log(`==> [2/3] Reading Duty Rates active on ${date}...`);

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

for (const line of readDutyLines(files.duty)) {
  const { hsCode, tariffSeqStr, tariffSeq, privilegeCode } =
    parseDutyKey(line);

  const isMulti = MULTI_CODES.has(privilegeCode);
  const isBi = BI_CODES.has(privilegeCode);
  if (!isMulti && !isBi) continue;

  const rateMatch = line.substring(21, 58).match(/(\d{1,2}\.\d{2,3})/);
  const dutyRate = rateMatch ? parseFloat(rateMatch[1]) : 0.0;
  const dateRange = parseDateRange(line);

  const hasCondition =
    line.includes("ต้องตรวจสอบ") ||
    line.includes("ท้ายประกาศ") ||
    privilegeCode === "ACN";

  const rateText = formatRatePercent(dutyRate);
  const legalRef = extractLegalRef(line, "ม.14", 50);

  const record = {
    hs_code: hsCode,
    tariff_seq: tariffSeqStr,
    privilege_code: privilegeCode,
    agreement_name: { th: privilegeCode, en: privilegeCode },
    description: getDescription(descriptionMap, hsCode),
    duty_rate: {
      percentage: dutyRate,
      is_exempt: dutyRate === 0,
      ...formatDutyDisplay(dutyRate === 0, hasCondition, rateText, rateText),
    },
    legal_notification: {
      th: legalRef || "ม.14",
      en: `Sec.14 (${privilegeCode})`,
    },
    effective_date: formatBilingualDate(dateRange.rawStartDate),
    expiry_date: formatBilingualDate(dateRange.rawEndDate),
    restrictions: {
      has_condition: hasCondition,
      note_th: hasCondition
        ? "ต้องตรวจสอบประเทศที่ได้รับสิทธิ์จากบัญชีท้ายประกาศกระทรวงการคลัง"
        : null,
      note_en: hasCondition
        ? "Country of Origin eligibility must be verified according to Ministry of Finance Notification Annex"
        : null,
    },
    _is_active: isActiveOn(dateRange, date),
    _start_int: dateRange.startInt,
  };

  const groupKey = `${hsCode}_${privilegeCode}`;
  if (isMulti) keepPreferredRecord(multilateralMap, groupKey, record, tariffSeq);
  if (isBi) keepPreferredRecord(bilateralMap, groupKey, record, tariffSeq);
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

const byCodeThenPrivilege = (a, b) =>
  a.hs_code.localeCompare(b.hs_code) ||
  a.privilege_code.localeCompare(b.privilege_code);
const multiRecords = stripInternalFields([...multilateralMap.values()]).sort(
  byCodeThenPrivilege,
);
const biRecords = stripInternalFields([...bilateralMap.values()]).sort(
  byCodeThenPrivilege,
);

writeJsonFiles(outputDir, {
  "fta_multilateral_full.json": multiRecords,
  "fta_bilateral_full.json": biRecords,
  "fta_by_hscode_grouped.json": {
    metadata: {
      generated_at: new Date().toISOString(),
      multilateral_count: multiRecords.length,
      bilateral_count: biRecords.length,
    },
    multilateral: groupBy(multiRecords, "hs_code"),
    bilateral: groupBy(biRecords, "hs_code"),
  },
});

console.log(`==> Completed: ${outputDir}`);
console.log(`   - Multilateral Records : ${multiRecords.length}`);
console.log(
  `   - Bilateral Records    : ${biRecords.length} (includes J1E, J1P, TAU)`,
);
