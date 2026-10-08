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
  formatRatePercent,
  formatDutyDisplay,
  keepPreferredRecord,
  stripInternalFields,
} = require("./lib/duty_rates");
const { writeJsonFiles, groupBy } = require("./lib/output");

const { baseDir, outputDir, date } = parseArgs("build_section12_rates.js", {
  baseDir: "./src/raw-data",
  outputDir: "./output/section12_json",
  date: null,
});
const files = requireRawFiles(baseDir, ["duty", "tariff"]);

// Descriptions
const tariffLines = createTariffLineResolver(baseDir, files);

// Duty Rates
const sec12Map = new Map();

for (const line of readDutyLines(files.duty)) {
  const { hsCode, tariffSeqStr, tariffSeq, privilegeCode } =
    parseDutyKey(line);
  if (privilegeCode !== "000") continue;

  const { adValoremRate, specificRate, unitInfo } = parseDutyRates(line);
  const dateRange = parseDateRange(line);

  // Per scheme (see lib/conditions.js): the portal never marks this regime.
  const hasCondition = false;

  const refMatch = line.match(/(ม\.12\s*ฉ\.\d+)/);
  const legalRefTh = refMatch ? `${refMatch[1]} (2565)` : "ม.12 ฉ.01 (2565)";

  const isExempt = adValoremRate === 0 && specificRate === 0;
  const rateText = formatRatePercent(adValoremRate);

  const tariffLine = tariffLines.resolve(hsCode, privilegeCode, parseLineNote(line));
  if (!tariffLine) continue;
  const record = {
    heading: hsCode.substring(0, 4).replace(/(\d{2})(\d{2})/, "$1.$2"),
    tariff_code: tariffLine.tariff_code,
    raw_hs_code: hsCode,
    tariff_seq: tariffSeqStr,
    privilege_code: "000",
    agreement_name: {
      th: "000 : อัตราอากรตามบัญชีท้ายประกาศกระทรวงการคลัง มาตรา 12 ภาค 2",
      en: "000 : Customs Tariff under Ministry of Finance Notification, Section 12 Part 2",
    },
    description: tariffLine.description,
    duty_rate: {
      ad_valorem_percentage: adValoremRate,
      specific_rate_baht: specificRate,
      specific_unit: unitInfo,
      is_exempt: isExempt,
      has_condition: hasCondition,
      ...formatDutyDisplay(isExempt, rateText, rateText),
    },
    legal_notification: { th: legalRefTh, en: "Sec.12 Notif.01 (2022)" },
    effective_date: formatBilingualDate(dateRange.rawStartDate),
    expiry_date: formatBilingualDate(dateRange.rawEndDate),
    _is_active: isActiveOn(dateRange, date),
    _start_int: dateRange.startInt,
  };

  keepPreferredRecord(sec12Map, `${tariffLine.tariff_code}_000`, record, tariffSeq);
}

const sec12Records = stripInternalFields([...sec12Map.values()]).sort((a, b) =>
  a.tariff_code.localeCompare(b.tariff_code),
);

writeJsonFiles(outputDir, {
  "section12_full_list.json": sec12Records,
  "section12_by_hscode.json": groupBy(sec12Records, "raw_hs_code"),
});
console.log(
  `==> Update complete: ${outputDir} (${sec12Records.length} records)`,
);
tariffLines.logUnresolved();
