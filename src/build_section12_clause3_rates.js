#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { rawFileExists, readRawText } = require("./lib/raw_file");

const args = process.argv.slice(2);
let baseDir = "./src/raw-data";
let outputDir = "./output/section12_clause3_json";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "-b" || args[i] === "--base-dir") baseDir = args[++i];
  else if (args[i] === "-o" || args[i] === "--output-dir")
    outputDir = args[++i];
}

const resolvedBaseDir = path.resolve(process.cwd(), baseDir);
const resolvedOutputDir = path.resolve(process.cwd(), outputDir);

const dutyFile = path.join(resolvedBaseDir, "REFDRT_Open_20220101.txt");
const tariffFile = path.join(resolvedBaseDir, "REFTRC_Open.txt");
const prvFile = path.join(resolvedBaseDir, "REFPRV_Open.txt");

if (
  !rawFileExists(dutyFile) ||
  !rawFileExists(tariffFile) ||
  !rawFileExists(prvFile)
) {
  console.error("Error: Required files are missing");
  process.exit(1);
}

if (!fs.existsSync(resolvedOutputDir))
  fs.mkdirSync(resolvedOutputDir, { recursive: true });

const CURRENT_DATE_INT = 20260928;
const UNIT_MAP = {
  KGM: { th: "กิโลกรัม", en: "Kilogram" },
  LTR: { th: "ลิตร", en: "Litre" },
  NMB: { th: "จำนวน", en: "Number / Units" },
  TNE: { th: "ตัน", en: "Tonne" },
};

// REFPRV
const prvText = readRawText(prvFile);
const prvLines = prvText.split(/\r?\n/).filter((l) => l.trim().length > 5);
const clause3Titles = new Map();

for (let i = 0; i < prvLines.length; i++) {
  const line = prvLines[i];
  const code = line.substring(0, 3).trim();
  if (/^3\d{2}$/.test(code)) {
    const remaining = line.substring(3).trim();
    const dateMatch = remaining.search(/\b20\d{6}\b/);
    const descTh =
      dateMatch !== -1
        ? remaining.substring(0, dateMatch).trim()
        : remaining.substring(0, 180).trim();
    clause3Titles.set(code, descTh);
  }
}

if (!clause3Titles.has("332"))
  clause3Titles.set(
    "332",
    "๓ ของที่นำเข้ามาเพื่อใช้ในการศึกษาวิจัยหรือทดลองทางวิทยาศาสตร์",
  );
if (!clause3Titles.has("335"))
  clause3Titles.set(
    "335",
    "๓ ของที่ได้รับยกเว้นอากรตามข้อผูกพันหรือตามสัญญาระหว่างประเทศ",
  );
if (!clause3Titles.has("380"))
  clause3Titles.set(
    "380",
    "๓ ของที่นำเข้าเพื่อใช้ในกระบวนการผลิตเพื่อส่งออกหรือวัตถุประสงค์เฉพาะ",
  );

// REFTRC
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

// REFDRT
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

const clause3Map = new Map();

for (let i = 0; i < drtLines.length; i++) {
  const line = drtLines[i];
  const hsCode = line.substring(4, 12).trim();
  const tariffSeqStr = line.substring(12, 17).trim();
  const tariffSeq = parseInt(tariffSeqStr, 10) || 0;
  const privilegeCode = line.substring(17, 20).trim();

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

  const rateChunk = line.substring(21, 45);
  const adValoremMatch = rateChunk.match(/(\d{1,3}\.\d{2,3})/);
  const adValoremRate = adValoremMatch ? parseFloat(adValoremMatch[1]) : 0.0;

  const specificChunk = line.substring(45, 65);
  const specificMatch = specificChunk.match(/(\d{1,4}\.\d{2,3})/);
  const specificRate = specificMatch ? parseFloat(specificMatch[1]) : 0.0;

  const unitMatch = line.substring(55, 75).match(/\b(KGM|LTR|NMB|TNE)\b/);
  const unitCode = unitMatch ? unitMatch[1] : "";
  const unitInfo = UNIT_MAP[unitCode] || {
    th: unitCode || "-",
    en: unitCode || "-",
  };

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

  // ** Check for conditions (Clause 3 exemptions usually carry a condition by default, since a specific order/list must be verified)
  const hasCondition =
    line.includes("ต้องตรวจสอบ") ||
    line.includes("ท้ายประกาศ") ||
    line.includes("เงื่อนไข") ||
    true;

  let legalRefTh = "ม.12 มีเงื่อนไขข้อ 3 (2565)";
  const refIndex = line.indexOf("ม.12");
  if (refIndex !== -1) {
    const tailPart = line.substring(refIndex);
    const dateIndex = tailPart.search(/\b(20\d{6}|99999999)\b/);
    const rawRef = (
      dateIndex !== -1
        ? tailPart.substring(0, dateIndex)
        : tailPart.substring(0, 45)
    ).trim();
    if (rawRef.includes("มีเงื่อนไข") || rawRef.includes("ข้อ 3"))
      legalRefTh = rawRef.replace(/\s+/g, " ");
  }

  const desc = descriptionMap.get(hsCode) || {
    th: "- - รายการตามพิกัด",
    en: "- - Tariff Item Description",
  };
  const schemeTitleTh =
    clause3Titles.get(privilegeCode) ||
    `มาตรา 12 มีเงื่อนไข ข้อ 3 (รหัสสิทธิ ${privilegeCode})`;
  const isExempt = adValoremRate === 0 && specificRate === 0;

  const formattedHs = `${hsCode.substring(0, 4)}.${hsCode.substring(4, 8)}00`;
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
      th: `${privilegeCode} : ${schemeTitleTh}`,
      en: `Section 12 Clause 3 (Code ${privilegeCode})`,
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
    legal_notification: {
      th: legalRefTh,
      en: "Sec.12 Condition Clause 3 (2022)",
    },
    effective_date: formatBilingualDate(rawStartDate),
    expiry_date: formatBilingualDate(rawEndDate),
    _is_active: isActiveCurrently,
    _start_int: startInt,
  };

  const groupKey = `${hsCode}_${privilegeCode}`;
  if (!clause3Map.has(groupKey)) {
    clause3Map.set(groupKey, record);
  } else {
    const existing = clause3Map.get(groupKey);
    if (!existing._is_active && record._is_active)
      clause3Map.set(groupKey, record);
    else if (
      existing._is_active &&
      record._is_active &&
      record._start_int >= existing._start_int
    )
      clause3Map.set(groupKey, record);
    else if (
      !existing._is_active &&
      !record._is_active &&
      tariffSeq > parseInt(existing.tariff_seq, 10)
    )
      clause3Map.set(groupKey, record);
  }
}

const records = Array.from(clause3Map.values())
  .map((r) => {
    const { _is_active, _start_int, ...clean } = r;
    return clean;
  })
  .sort(
    (a, b) =>
      a.raw_hs_code.localeCompare(b.raw_hs_code) ||
      a.privilege_code.localeCompare(b.privilege_code),
  );

const groupedByHs = {};
records.forEach((r) => {
  if (!groupedByHs[r.raw_hs_code]) groupedByHs[r.raw_hs_code] = [];
  groupedByHs[r.raw_hs_code].push(r);
});

fs.writeFileSync(
  path.join(resolvedOutputDir, "section12_clause3_full_list.json"),
  JSON.stringify(records, null, 2),
  "utf8",
);
fs.writeFileSync(
  path.join(resolvedOutputDir, "section12_clause3_by_hscode.json"),
  JSON.stringify(groupedByHs, null, 2),
  "utf8",
);
console.log(
  `==> Update complete: ${resolvedOutputDir} (${records.length} records)`,
);
