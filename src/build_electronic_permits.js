#!/usr/bin/env node

const path = require("path");
const { parseArgs } = require("./lib/cli");
const { readRawText } = require("./lib/raw_file");
const { writeJsonFiles, groupBy } = require("./lib/output");

const { input, outputDir } = parseArgs("build_electronic_permits.js", {
  input: "./src/raw-data/REFPMG_Open.txt",
  outputDir: "./output/permit_json",
});

// Issuing agency by the 13-digit tax ID in the REFPMG line. Names are the ones
// the ITD portal shows (permit page, Thai and English); every ID in the file
// was checked against the portal.
const AGENCY_TAX_MAP = {
  "0994000011679": { th: "กรมการอุตสาหกรรมทหาร", en: "Defence Industry Department" },
  "0994000036213": { th: "กรมอุตสาหกรรมพื้นฐานและการเหมืองแร่", en: "Department of Primary Industries and Mines" },
  "0994000036337": { th: "กรมธุรกิจพลังงาน", en: "Department of Energy Business" },
  "0994000037015": { th: "สำนักงานมาตรฐานสินค้าเกษตรและอาหารแห่งชาติ", en: "National Bureau of Agricultural Commodity Food Standards" },
  "0994000041969": { th: "กรมอุทยานแห่งชาติ สัตว์ป่าและพันธุ์พืช", en: "Department of National Parks, Wildlife and Plant Conservation" },
  "0994000049447": { th: "สำนักงานคณะกรรมการกิจการกระจายเสียง กิจการโทรทัศน์ และกิจการโทรคมนาคมแห่งชาติ", en: "Office of The National Broadcasting and Telecommunications Commission" },
  "0994000132115": { th: "สำนักงานคณะกรรมการอ้อยและน้ำตาลทราย", en: "The Office of the Cane and Sugar Board" },
  "0994000158921": { th: "กรมวิชาการเกษตร", en: "Department of Agriculture" },
  "0994000159251": { th: "กรมปศุสัตว์", en: "Department of Livestock Development" },
  "0994000159544": { th: "สำนักงานปรมาณูเพื่อสันติ", en: "Office of Atoms for Peace" },
  "0994000159561": { th: "กรมการค้าต่างประเทศ", en: "Department of Foreign Trade" },
  "0994000159897": { th: "กรมป่าไม้", en: "Royal Forest Department" },
  "0994000160259": { th: "กรมประมง", en: "Department of Fisheries" },
  "0994000160461": { th: "กรมสรรพสามิต", en: "Excise Department" },
  "0994000160682": { th: "กรมวิทยาศาสตร์การแพทย์", en: "Department of Medical Science" },
  "0994000160887": { th: "กรมทรัพยากรธรณี", en: "Department of Mineral Resources" },
  // The portal's English page prints "Department of Foreign Trade" for this
  // ID, but its Thai name is the Department of Internal Trade.
  "0994000161450": { th: "กรมการค้าภายใน", en: "Department of Internal Trade" },
  "0994000162626": { th: "กรมการปกครอง", en: "Department of Provincial Administration" },
  "0994000162847": { th: "กรมศิลปากร", en: "Fine Arts Department" },
  "0994000165161": { th: "สำนักงานมาตรฐานผลิตภัณฑ์อุตสาหกรรม", en: "Thai Industrial Standards Institute (TISI)" },
  "0994000165676": { th: "สำนักงานคณะกรรมการอาหารและยา", en: "Food and Drug Administration (FDA)" },
  "0994000528116": { th: "กรมโรงงานอุตสาหกรรม", en: "Department of Industrial Works" },
  "0994001057192": { th: "การยางแห่งประเทศไทย", en: "Rubber Authority of Thailand" },
};

// Digit 16 of a REFPMG line (right after the 3-digit stat code) is the
// regulation case. Matches the portal's "ของต้องกำกัด กรณี" column.
const REGULATION_CASES = {
  0: { key: "IMPORT", th: "นำเข้า", en: "Import" },
  1: { key: "EXPORT", th: "ส่งออก", en: "Export" },
  2: { key: "CROSSING", th: "ผ่านแดน", en: "Crossing" },
  3: { key: "IMPORT_EXPORT", th: "นำเข้าและส่งออก", en: "Import and export" },
};

// Unlike lib/dates, REFPMG shows an open-ended date as 99/99/9999
function formatPermitDate(dateStr) {
  if (!dateStr || dateStr === "99999999") {
    return { iso: null, th: "99/99/9999", en: "99/99/9999" };
  }
  const clean = dateStr.replace(/[^0-9]/g, "");
  if (clean.length === 8) {
    const yyyy = parseInt(clean.substring(0, 4), 10);
    const mm = clean.substring(4, 6);
    const dd = clean.substring(6, 8);
    return {
      iso: `${yyyy}-${mm}-${dd}`,
      th: `${dd}/${mm}/${yyyy + 543}`,
      en: `${dd}/${mm}/${yyyy}`,
    };
  }
  return { iso: null, th: dateStr, en: dateStr };
}

console.log(
  `==> Reading REFPMG permit file: ${path.basename(input)}`,
);
const text = readRawText(input);
const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 30);

console.log(`==> Total lines read: ${lines.length}`);

const flatPermitsList = [];
const unknownAgencies = new Map();
const skipped = [];

for (const line of lines) {

  // HS Code: Byte 4 to 12 (8 digits)
  const rawHs = line.substring(4, 12).trim();
  if (!rawHs || rawHs.length !== 8 || !/^\d{8}$/.test(rawHs)) continue;

  // Stat Code: Byte 12 to 15 (3 digits)
  const statCode = line.substring(12, 15).trim() || "000";

  // Regulation case: Byte 15 (1 digit)
  const caseInfo = REGULATION_CASES[line.charAt(15)];
  if (!caseInfo) {
    skipped.push(`${rawHs}/${statCode}: unknown case digit "${line.charAt(15)}"`);
    continue;
  }

  // Agency Tax ID: find the 13-digit ID starting with 0994 near the beginning of the line
  const taxMatch = line.match(/\b(0994\d{9})\b/);
  const agencyTaxId = taxMatch ? taxMatch[1] : "";

  // Condition Flag: if 'Y' is present, set "ต้องมีใบอนุญาต" (permit required)
  const isRequired = line.includes(" Y ") || line.includes("ต้องมีใบอนุญาต");
  const conditionTh = isRequired ? "ต้องมีใบอนุญาต" : "ไม่ต้องมีใบอนุญาต";
  const conditionEn = isRequired ? "Permit Required" : "No Permit Required";

  // The line ends with three YYYYMMDD dates: announcement date, start date,
  // end date (99999999 = open-ended).
  const dateTail = line.trimEnd().match(/(\d{8})(\d{8})(\d{8})$/);
  if (!dateTail) {
    skipped.push(`${rawHs}/${statCode}: no trailing date triple`);
    continue;
  }
  const [, , rawStartDate, rawEndDate] = dateTail;

  let agencyInfo = AGENCY_TAX_MAP[agencyTaxId];
  if (!agencyInfo) {
    unknownAgencies.set(agencyTaxId, (unknownAgencies.get(agencyTaxId) || 0) + 1);
    agencyInfo = { th: "หน่วยงานควบคุมตามพิกัด", en: "Regulating Authority" };
  }

  // Formatted HS Code (08012100 -> 0801.21.00)
  const formattedHs = `${rawHs.substring(0, 4)}.${rawHs.substring(4, 6)}.${rawHs.substring(6, 8)}`;

  const record = {
    hs_code: formattedHs,
    raw_hs_code: rawHs,
    stat_code: statCode,
    issuing_agency: {
      th: agencyInfo.th,
      en: agencyInfo.en,
    },
    regulation_case: {
      key: caseInfo.key,
      th: caseInfo.th,
      en: caseInfo.en,
    },
    condition: {
      th: conditionTh,
      en: conditionEn,
    },
    effective_date: formatPermitDate(rawStartDate),
    expiry_date: formatPermitDate(rawEndDate),
  };

  flatPermitsList.push(record);
}

if (unknownAgencies.size > 0) {
  console.warn(
    `!! Unmapped agency tax IDs (fell back to "Regulating Authority"): ${[...unknownAgencies].map(([id, n]) => `${id || "<none>"} x${n}`).join(", ")}`,
  );
}
if (skipped.length > 0) {
  console.warn(`!! Skipped ${skipped.length} lines:\n   ${skipped.slice(0, 10).join("\n   ")}`);
}

const permitsByHs = groupBy(flatPermitsList, "raw_hs_code");

writeJsonFiles(outputDir, {
  "electronic_permits_flat.json": flatPermitsList,
  "electronic_permits_by_hscode.json": permitsByHs,
});

console.log(`\n======================================================`);
console.log(`==> Filtering completed successfully: ${outputDir}`);
console.log(`   - flat records : ${flatPermitsList.length}`);
console.log(`   - unique HS    : ${Object.keys(permitsByHs).length}`);
console.log(`======================================================`);
