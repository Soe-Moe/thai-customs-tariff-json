#!/usr/bin/env node

const { parseArgs } = require("./lib/cli");
const { requireRawFiles } = require("./lib/raw_file");
const { formatBilingualDate } = require("./lib/dates");
const { loadPrivilegeTitles } = require("./lib/privileges");
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
  extractLegalRef,
  formatRate,
  formatDutyDisplay,
  keepPreferredRecord,
  stripInternalFields,
} = require("./lib/duty_rates");
const { writeJsonFiles, groupBy } = require("./lib/output");

const { baseDir, outputDir, date } = parseArgs(
  "build_section12_clause2_rates.js",
  {
    baseDir: "./src/raw-data",
    outputDir: "./output/section12_clause2_json",
    date: null,
  },
);
const files = requireRawFiles(baseDir, ["duty", "tariff", "privilege"]);

// REFPRV
const clause2Titles = loadPrivilegeTitles(files.privilege, /^2\d{2}$/, {
  220: "๒ (๑๒) ผลิตภัณฑ์ที่ได้จากการนำวัตถุดิบเข้ามาผลิต ผสม ประกอบ บรรจุ หรือดำเนินการอื่นใด ในเขตปลอดอากร หรือเขตประกอบการเสรี หรือผลิต ผสมประกอบ ในเขตอุตสาหกรรมส่งออก",
  226: "๒ (๑๗) (ก) ลดลงเหลือกึ่งหนึ่งของอัตราอากรที่เรียกเก็บเป็นการทั่วไป",
  227: "๒ (๑๗) (ข) เป็นผู้ได้รับการคัดเลือกจากกรมศุลกากรให้เป็นผู้นำของเข้าหรือผู้ส่งของออกระดับมาตรฐานเออีโอ",
});

// REFTRC
const tariffLines = createTariffLineResolver(baseDir, files);

// REFDRT
const clause2Map = new Map();

for (const line of readDutyLines(files.duty)) {
  const { hsCode, tariffSeqStr, tariffSeq, privilegeCode } =
    parseDutyKey(line);

  if (!line.includes("ม.12")) continue;
  if (line.includes("ข้อ 3") || line.includes("ข้อ3") || line.includes("ภาค 3"))
    continue;

  const isClause2 =
    line.includes("ข้อ 2") ||
    line.includes("ข้อ2") ||
    line.includes("ภาค 2") ||
    /^2\d{2}$/.test(privilegeCode);
  if (!isClause2 || privilegeCode === "000") continue;

  const { adValoremRate, specificRate, unitInfo } = parseDutyRates(line);
  const dateRange = parseDateRange(line);

  // Per scheme (see lib/conditions.js): the portal never marks Section 12
  // codes; their condition is the scheme title.
  const hasCondition = false;

  const rawRef = extractLegalRef(line, "ม.12", 45);
  const legalRefTh = rawRef?.includes("มีเงื่อนไข")
    ? rawRef.replace(/\s+/g, " ")
    : "ม.12 มีเงื่อนไขข้อ 2 (2565)";

  const schemeTitleTh =
    clause2Titles.get(privilegeCode) ||
    `มาตรา 12 มีเงื่อนไข ข้อ 2 (รหัสสิทธิ ${privilegeCode})`;
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
      th: `${privilegeCode} : ${schemeTitleTh}`,
      en: `Section 12 Clause 2 (Code ${privilegeCode})`,
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
    legal_notification: {
      th: legalRefTh,
      en: "Sec.12 Condition Clause 2 (2022)",
    },
    effective_date: formatBilingualDate(dateRange.rawStartDate),
    expiry_date: formatBilingualDate(dateRange.rawEndDate),
    _is_active: isActiveOn(dateRange, date),
    _start_int: dateRange.startInt,
  };

  keepPreferredRecord(
    clause2Map,
    `${tariffLine.tariff_code}_${privilegeCode}`,
    record,
    tariffSeq,
  );
}

const records = stripInternalFields([...clause2Map.values()]).sort(
  (a, b) =>
    a.tariff_code.localeCompare(b.tariff_code) ||
    a.privilege_code.localeCompare(b.privilege_code),
);

writeJsonFiles(outputDir, {
  "section12_clause2_full_list.json": records,
  "section12_clause2_by_hscode.json": groupBy(records, "raw_hs_code"),
});
console.log(`==> Update complete: ${outputDir} (${records.length} records)`);
tariffLines.logUnresolved();
