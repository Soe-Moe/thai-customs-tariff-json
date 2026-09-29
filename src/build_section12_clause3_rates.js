#!/usr/bin/env node

const { parseArgs } = require("./lib/cli");
const { requireRawFiles } = require("./lib/raw_file");
const { formatBilingualDate } = require("./lib/dates");
const { loadPrivilegeTitles } = require("./lib/privileges");
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

const { baseDir, outputDir, date } = parseArgs(
  "build_section12_clause3_rates.js",
  {
    baseDir: "./src/raw-data",
    outputDir: "./output/section12_clause3_json",
    date: null,
  },
);
const files = requireRawFiles(baseDir, ["duty", "tariff", "privilege"]);

// REFPRV
const clause3Titles = loadPrivilegeTitles(files.privilege, /^3\d{2}$/, {
  332: "๓ ของที่นำเข้ามาเพื่อใช้ในการศึกษาวิจัยหรือทดลองทางวิทยาศาสตร์",
  335: "๓ ของที่ได้รับยกเว้นอากรตามข้อผูกพันหรือตามสัญญาระหว่างประเทศ",
  380: "๓ ของที่นำเข้าเพื่อใช้ในกระบวนการผลิตเพื่อส่งออกหรือวัตถุประสงค์เฉพาะ",
});

// REFTRC
const descriptionMap = loadDescriptionMap(files.tariff);

// REFDRT
const clause3Map = new Map();

for (const line of readDutyLines(files.duty)) {
  const { hsCode, tariffSeqStr, tariffSeq, privilegeCode } =
    parseDutyKey(line);

  if (!line.includes("ม.12")) continue;
  const isExplicitClause2 =
    line.includes("ข้อ 2") || line.includes("ข้อ2") || line.includes("ภาค 2");
  if (isExplicitClause2 && !line.includes("ข้อ 3")) continue;

  const isClause3 =
    line.includes("ข้อ 3") ||
    line.includes("ข้อ3") ||
    line.includes("ภาค 3") ||
    /^3\d{2}$/.test(privilegeCode);
  if (!isClause3 || privilegeCode === "000") continue;

  const { adValoremRate, specificRate, unitInfo } = parseDutyRates(line);
  const dateRange = parseDateRange(line);

  // ** Clause 3 exemptions always carry a condition, since a specific order/list must be verified
  const hasCondition = true;

  const rawRef = extractLegalRef(line, "ม.12", 45);
  const legalRefTh =
    rawRef?.includes("มีเงื่อนไข") || rawRef?.includes("ข้อ 3")
      ? rawRef.replace(/\s+/g, " ")
      : "ม.12 มีเงื่อนไขข้อ 3 (2565)";

  const schemeTitleTh =
    clause3Titles.get(privilegeCode) ||
    `มาตรา 12 มีเงื่อนไข ข้อ 3 (รหัสสิทธิ ${privilegeCode})`;
  const isExempt = adValoremRate === 0 && specificRate === 0;
  const rateText = formatRate(adValoremRate);

  const record = {
    heading: hsCode.substring(0, 4).replace(/(\d{2})(\d{2})/, "$1.$2"),
    tariff_code: `${hsCode.substring(0, 4)}.${hsCode.substring(4, 8)}00`,
    raw_hs_code: hsCode,
    tariff_seq: tariffSeqStr,
    privilege_code: privilegeCode,
    scheme_title: {
      th: `${privilegeCode} : ${schemeTitleTh}`,
      en: `Section 12 Clause 3 (Code ${privilegeCode})`,
    },
    description: getDescription(descriptionMap, hsCode),
    duty_rate: {
      ad_valorem_percentage: adValoremRate,
      specific_rate_baht: specificRate,
      specific_unit: unitInfo,
      is_exempt: isExempt,
      has_condition: hasCondition,
      ...formatDutyDisplay(isExempt, hasCondition, rateText, `${rateText}%`),
    },
    legal_notification: {
      th: legalRefTh,
      en: "Sec.12 Condition Clause 3 (2022)",
    },
    effective_date: formatBilingualDate(dateRange.rawStartDate),
    expiry_date: formatBilingualDate(dateRange.rawEndDate),
    _is_active: isActiveOn(dateRange, date),
    _start_int: dateRange.startInt,
  };

  keepPreferredRecord(
    clause3Map,
    `${hsCode}_${privilegeCode}`,
    record,
    tariffSeq,
  );
}

const records = stripInternalFields([...clause3Map.values()]).sort(
  (a, b) =>
    a.raw_hs_code.localeCompare(b.raw_hs_code) ||
    a.privilege_code.localeCompare(b.privilege_code),
);

writeJsonFiles(outputDir, {
  "section12_clause3_full_list.json": records,
  "section12_clause3_by_hscode.json": groupBy(records, "raw_hs_code"),
});
console.log(`==> Update complete: ${outputDir} (${records.length} records)`);
