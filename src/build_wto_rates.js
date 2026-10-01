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
  parseDutyRates,
  parseDateRange,
  isActiveOn,
  extractLegalRef,
  formatRate,
  formatDutyDisplay,
  keepPreferredRecord,
  stripInternalFields,
} = require("./lib/duty_rates");
const { writeJsonFiles, groupBy } = require("./lib/output");

const { baseDir, outputDir, date } = parseArgs("build_wto_rates.js", {
  baseDir: "./src/raw-data",
  outputDir: "./output/wto_json",
  date: null,
});
const files = requireRawFiles(baseDir, ["duty", "tariff"]);

// 1. Goods Descriptions (REFTRC)
console.log(`==> [1/2] Reading Descriptions (REFTRC)...`);
const descriptionMap = loadDescriptionMap(files.tariff);

// 2. WTO Duty Rates (REFDRT)
console.log(`==> [2/2] Filtering WTO records from REFDRT...`);
const wtoMap = new Map();

for (const line of readDutyLines(files.duty)) {
  const { hsCode, tariffSeqStr, tariffSeq, privilegeCode } =
    parseDutyKey(line);

  // Check WTO Privilege Code
  if (
    privilegeCode !== "WTO" &&
    !privilegeCode.startsWith("WT") &&
    !privilegeCode.startsWith("W0")
  ) {
    continue;
  }

  const { adValoremRate, specificRate, unitInfo } = parseDutyRates(line);
  const dateRange = parseDateRange(line);

  // Per scheme (see lib/conditions.js): the portal never marks this regime.
  const hasCondition = false;

  // Legal Reference (Section 14 WTO)
  const legalRefTh = extractLegalRef(line, "ม.14", 30) || "ม.14 WTO(2565)";

  const isExempt = adValoremRate === 0 && specificRate === 0;
  const rateText = formatRate(adValoremRate);

  const record = {
    heading: hsCode.substring(0, 4).replace(/(\d{2})(\d{2})/, "$1.$2"),
    tariff_code: `${hsCode.substring(0, 4)}.${hsCode.substring(4, 8)}00`,
    raw_hs_code: hsCode,
    tariff_seq: tariffSeqStr,
    privilege_code: privilegeCode,
    agreement_name: {
      th: "WTO : องค์การการค้าโลก",
      en: "WTO : World Trade Organization",
    },
    description: getDescription(descriptionMap, hsCode),
    duty_rate: {
      ad_valorem_percentage: adValoremRate,
      specific_rate_baht: specificRate,
      specific_unit: unitInfo,
      is_exempt: isExempt,
      has_condition: hasCondition,
      ...formatDutyDisplay(isExempt, rateText, `${rateText}%`),
    },
    legal_notification: {
      th: legalRefTh,
      en: "Sec.14 WTO (2022)",
    },
    effective_date: formatBilingualDate(dateRange.rawStartDate),
    expiry_date: formatBilingualDate(dateRange.rawEndDate),
    _is_active: isActiveOn(dateRange, date),
    _start_int: dateRange.startInt,
  };

  keepPreferredRecord(wtoMap, `${hsCode}_${privilegeCode}`, record, tariffSeq);
}

const wtoRecords = stripInternalFields([...wtoMap.values()]).sort((a, b) =>
  a.raw_hs_code.localeCompare(b.raw_hs_code),
);
const wtoByHs = groupBy(wtoRecords, "raw_hs_code");

writeJsonFiles(outputDir, {
  "wto_full_list.json": wtoRecords,
  "wto_by_hscode.json": wtoByHs,
});

console.log(`\n======================================================`);
console.log(`==> WTO data updated successfully: ${outputDir}`);
console.log(`   1. wto_full_list.json (${wtoRecords.length} records)`);
console.log(
  `   2. wto_by_hscode.json (${Object.keys(wtoByHs).length} HS Codes)`,
);
console.log(`======================================================`);
