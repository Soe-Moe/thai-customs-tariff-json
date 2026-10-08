#!/usr/bin/env node

const { parseArgs } = require("./lib/cli");
const { requireRawFiles } = require("./lib/raw_file");
const { formatBilingualDate } = require("./lib/dates");
const {
  parseLineNote,
  createTariffLineResolver,
} = require("./lib/tariff_lines");
const {
  readDutyLines,
  parseDutyKey,
  parseDutyRates,
  parseDateRange,
  isActiveOn,
  formatRate,
  formatDutyDisplay,
  keepPreferredRecord,
  stripInternalFields,
} = require("./lib/duty_rates");
const { writeJsonFiles, groupBy } = require("./lib/output");
const { PORTAL_CONDITION_CODES } = require("./lib/conditions");

const { baseDir, outputDir, date } = parseArgs("build_asean_atiga_rates.js", {
  baseDir: "./src/raw-data",
  outputDir: "./output/asean_json",
  date: null,
});
const files = requireRawFiles(baseDir, ["duty", "tariff"]);

// ASEAN Privilege Code Definitions
const ASEAN_SCHEMES = {
  ATG: {
    title_th: "ATG : อาเซียน",
    title_en: "ATG : ASEAN (ATIGA)",
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
    condition_note_th: null,
    condition_note_en: null,
  },
};

// 1. Goods Descriptions (REFTRC)
console.log(`==> [1/2] Reading Descriptions (REFTRC)...`);
const tariffLines = createTariffLineResolver(baseDir, files);

// 2. ASEAN Duty Rates (REFDRT - ATG / ASC)
console.log(`==> [2/2] Filtering ASEAN (ATG / ASC) records from REFDRT...`);
const aseanMap = new Map();

for (const line of readDutyLines(files.duty)) {
  const { hsCode, tariffSeqStr, tariffSeq, privilegeCode } =
    parseDutyKey(line);

  // Check for ATG and ASC
  const schemeMeta = ASEAN_SCHEMES[privilegeCode];
  if (!schemeMeta) continue;

  const { adValoremRate, specificRate, unitInfo } = parseDutyRates(line);
  const dateRange = parseDateRange(line);

  // Per scheme (see lib/conditions.js).
  const hasCondition = PORTAL_CONDITION_CODES.has(privilegeCode);

  const isExempt = adValoremRate === 0 && specificRate === 0;
  const rateText = formatRate(adValoremRate);

  const tariffLine = tariffLines.resolve(hsCode, privilegeCode, parseLineNote(line));
  if (!tariffLine) continue;
  const record = {
    heading: hsCode.substring(0, 4).replace(/(\d{2})(\d{2})/, "$1.$2"),
    tariff_code: tariffLine.tariff_code,
    raw_hs_code: hsCode,
    tariff_seq: tariffSeqStr,
    privilege_code: privilegeCode,
    scheme_title: {
      th: schemeMeta.title_th,
      en: schemeMeta.title_en,
    },
    description: tariffLine.description,
    duty_rate: {
      ad_valorem_percentage: adValoremRate,
      specific_rate_baht: specificRate,
      specific_unit: unitInfo,
      is_exempt: isExempt,
      has_condition: hasCondition,
      ...formatDutyDisplay(isExempt, rateText, `${rateText}%`),
    },
    condition_note: {
      th: hasCondition ? schemeMeta.condition_note_th : null,
      en: hasCondition ? schemeMeta.condition_note_en : null,
    },
    legal_notification: {
      th: "ม.14 ATIGA(อาเซียน 2565)",
      en: "Sec.14 ATIGA (ASEAN 2022)",
    },
    effective_date: formatBilingualDate(dateRange.rawStartDate),
    expiry_date: formatBilingualDate(dateRange.rawEndDate),
    _is_active: isActiveOn(dateRange, date),
    _start_int: dateRange.startInt,
  };

  keepPreferredRecord(
    aseanMap,
    `${tariffLine.tariff_code}_${privilegeCode}`,
    record,
    tariffSeq,
  );
}

// Clean internal fields and sort
const aseanRecords = stripInternalFields([...aseanMap.values()]).sort(
  (a, b) =>
    a.tariff_code.localeCompare(b.tariff_code) ||
    a.privilege_code.localeCompare(b.privilege_code),
);
const aseanByHs = groupBy(aseanRecords, "raw_hs_code");

writeJsonFiles(outputDir, {
  "asean_atiga_full_list.json": aseanRecords,
  "asean_atiga_by_hscode.json": aseanByHs,
});

console.log(`\n======================================================`);
console.log(`==> ASEAN (ATIGA) data extracted successfully: ${outputDir}`);
console.log(`   1. asean_atiga_full_list.json (${aseanRecords.length} records)`);
console.log(
  `   2. asean_atiga_by_hscode.json (${Object.keys(aseanByHs).length} HS Codes)`,
);
console.log(`======================================================`);
tariffLines.logUnresolved();
