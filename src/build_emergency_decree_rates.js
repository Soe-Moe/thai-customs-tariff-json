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
  formatRate,
  formatDutyDisplay,
  keepPreferredRecord,
  stripInternalFields,
} = require("./lib/duty_rates");
const { writeJsonFiles, groupBy } = require("./lib/output");

const { baseDir, outputDir, date } = parseArgs(
  "build_emergency_decree_rates.js",
  {
    baseDir: "./src/raw-data",
    outputDir: "./output/emergency_decree_json",
    date: null,
  },
);
const files = requireRawFiles(baseDir, ["duty", "tariff"]);

// 1. Goods Descriptions (REFTRC)
console.log(`==> [1/2] Reading Descriptions (REFTRC)...`);
const descriptionMap = loadDescriptionMap(files.tariff);

// 2. Emergency Decree Duty Rates (REFDRT - Privilege Code 999)
console.log(
  `==> [2/2] Filtering Emergency Decree (999) records from REFDRT...`,
);
const emergencyDecreeMap = new Map();

for (const line of readDutyLines(files.duty)) {
  const { hsCode, tariffSeqStr, tariffSeq, privilegeCode } =
    parseDutyKey(line);

  // The Privilege Code for the Emergency Decree (maximum ceiling rate) is 999
  if (privilegeCode !== "999") continue;

  const { adValoremRate, specificRate, unitInfo } = parseDutyRates(line);
  const dateRange = parseDateRange(line);

  // Per scheme (see lib/conditions.js): the portal never marks this regime.
  const hasCondition = false;

  // Legal Reference (Emergency Decree No. 7, B.E. 2565 / 2022)
  const issueMatch = line.match(/(ฉบับที่\s*\d+)/);
  const legalRefTh = issueMatch
    ? `พรก. ${issueMatch[1]} พ.ศ. 2565`
    : "พรก. ฉบับที่ 7 พ.ศ. 2565";

  const isExempt = adValoremRate === 0 && specificRate === 0;
  const rateText = formatRate(adValoremRate);

  const record = {
    heading: hsCode.substring(0, 4).replace(/(\d{2})(\d{2})/, "$1.$2"),
    tariff_code: `${hsCode.substring(0, 4)}.${hsCode.substring(4, 6)}.${hsCode.substring(6, 8)}`,
    raw_hs_code: hsCode,
    tariff_seq: tariffSeqStr,
    privilege_code: "999",
    scheme_title: {
      th: "999 : อัตราอากรตามภาค 2 แห่ง พรก. 2530 (อัตราเพดานสูงสุด)",
      en: "999 : Emergency Decree on Customs Tariff B.E. 2530 (Part 2 Ceiling Rates)",
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
      en: "Emergency Decree No. 7 (2022)",
    },
    effective_date: formatBilingualDate(dateRange.rawStartDate),
    expiry_date: formatBilingualDate(dateRange.rawEndDate),
    _is_active: isActiveOn(dateRange, date),
    _start_int: dateRange.startInt,
  };

  keepPreferredRecord(emergencyDecreeMap, `${hsCode}_999`, record, tariffSeq);
}

const records = stripInternalFields([...emergencyDecreeMap.values()]).sort(
  (a, b) => a.raw_hs_code.localeCompare(b.raw_hs_code),
);
const groupedByHs = groupBy(records, "raw_hs_code");

writeJsonFiles(outputDir, {
  "emergency_decree_full_list.json": records,
  "emergency_decree_by_hscode.json": groupedByHs,
});

console.log(`\n======================================================`);
console.log(
  `==> Emergency Decree (999) data extracted successfully: ${outputDir}`,
);
console.log(`   1. emergency_decree_full_list.json (${records.length} records)`);
console.log(
  `   2. emergency_decree_by_hscode.json (${Object.keys(groupedByHs).length} HS Codes)`,
);
console.log(`======================================================`);
