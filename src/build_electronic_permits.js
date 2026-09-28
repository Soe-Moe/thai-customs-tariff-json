#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { readRawText } = require("./lib/raw_file");

const args = process.argv.slice(2);
let inputPath = "./src/raw-data/REFPMG_Open.txt";
let outputDir = "./output/permit_json";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "-i" || args[i] === "--input") inputPath = args[++i];
  else if (args[i] === "-o" || args[i] === "--output-dir")
    outputDir = args[++i];
}

const resolvedInput = path.resolve(process.cwd(), inputPath);
const resolvedOutputDir = path.resolve(process.cwd(), outputDir);

if (!fs.existsSync(resolvedOutputDir)) {
  fs.mkdirSync(resolvedOutputDir, { recursive: true });
}

// Official NSW Tax ID map of Thai government agencies
const AGENCY_TAX_MAP = {
  // Department of Agriculture (DOA)
  "0994000158921": { th: "กรมวิชาการเกษตร", en: "Department of Agriculture" },
  "0994000164861": { th: "กรมวิชาการเกษตร", en: "Department of Agriculture" },

  // Food and Drug Administration (FDA)
  "0994000165676": {
    th: "สำนักงานคณะกรรมการอาหารและยา",
    en: "Food and Drug Administration (FDA)",
  },
  "0994000159493": {
    th: "สำนักงานคณะกรรมการอาหารและยา",
    en: "Food and Drug Administration (FDA)",
  },

  // Department of Livestock Development (DLD)
  "0994000159507": {
    th: "กรมปศุสัตว์",
    en: "Department of Livestock Development",
  },
  "0994000164853": {
    th: "กรมปศุสัตว์",
    en: "Department of Livestock Development",
  },

  // Department of Fisheries (DOF)
  "0994000159515": { th: "กรมประมง", en: "Department of Fisheries" },
  "0994000164845": { th: "กรมประมง", en: "Department of Fisheries" },

  // Department of Foreign Trade (DFT)
  "0994000164888": {
    th: "กรมการค้าต่างประเทศ",
    en: "Department of Foreign Trade",
  },

  // Department of Industrial Works (DIW)
  "0994000165035": {
    th: "กรมโรงงานอุตสาหกรรม",
    en: "Department of Industrial Works",
  },

  // Thai Industrial Standards Institute (TISI)
  "0994000164837": {
    th: "สำนักงานมาตรฐานผลิตภัณฑ์อุตสาหกรรม",
    en: "Thai Industrial Standards Institute (TISI)",
  },

  // Customs Department
  "0994000011679": {
    th: "กรมศุลกากร / หน่วยงานควบคุมร่วม",
    en: "The Customs Department / Joint Agency",
  },
};

function formatBilingualDate(dateStr) {
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
  `==> Reading REFPMG permit file: ${path.basename(resolvedInput)}`,
);
const text = readRawText(resolvedInput);
const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 30);

console.log(`==> Total lines read: ${lines.length}`);

const permitsByHs = {};
const flatPermitsList = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // HS Code: Byte 4 to 12 (8 digits)
  const rawHs = line.substring(4, 12).trim();
  if (!rawHs || rawHs.length !== 8 || !/^\d{8}$/.test(rawHs)) continue;

  // Stat Code: Byte 12 to 15 (3 digits)
  const statCode = line.substring(12, 15).trim() || "000";

  // Agency Tax ID: find the 13-digit ID starting with 0994 near the beginning of the line
  const taxMatch = line.match(/\b(0994\d{9})\b/);
  const agencyTaxId = taxMatch ? taxMatch[1] : "";

  // Condition Flag: if 'Y' is present, set "ต้องมีใบอนุญาต" (permit required)
  const isRequired = line.includes(" Y ") || line.includes("ต้องมีใบอนุญาต");
  const conditionTh = isRequired ? "ต้องมีใบอนุญาต" : "ไม่ต้องมีใบอนุญาต";
  const conditionEn = isRequired ? "Permit Required" : "No Permit Required";

  // Find the 16-digit date pair (Start Date + End Date at the end of the line)
  // Format: YYYYMMDDYYYYMMDD (e.g. 2015040199999999 or 2015090199999999)
  const allDatePairs = [
    ...line.matchAll(/(20\d{6}|19\d{6})(20\d{6}|99999999)/g),
  ];
  let rawStartDate = "20150101";
  let rawEndDate = "99999999";

  if (allDatePairs.length > 0) {
    const lastPair = allDatePairs[allDatePairs.length - 1];
    rawStartDate = lastPair[1];
    rawEndDate = lastPair[2];
  }

  // Agency Name Mapping
  let agencyInfo = AGENCY_TAX_MAP[agencyTaxId];
  if (!agencyInfo) {
    if (line.includes("เกษตร"))
      agencyInfo = { th: "กรมวิชาการเกษตร", en: "Department of Agriculture" };
    else if (line.includes("อาหารและยา") || line.includes("อย."))
      agencyInfo = {
        th: "สำนักงานคณะกรรมการอาหารและยา",
        en: "Food and Drug Administration (FDA)",
      };
    else if (line.includes("ปศุสัตว์"))
      agencyInfo = {
        th: "กรมปศุสัตว์",
        en: "Department of Livestock Development",
      };
    else if (line.includes("ประมง"))
      agencyInfo = { th: "กรมประมง", en: "Department of Fisheries" };
    else if (line.includes("โรงงาน"))
      agencyInfo = {
        th: "กรมโรงงานอุตสาหกรรม",
        en: "Department of Industrial Works",
      };
    else if (line.includes("การค้าต่างประเทศ"))
      agencyInfo = {
        th: "กรมการค้าต่างประเทศ",
        en: "Department of Foreign Trade",
      };
    else
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
      th: "นำเข้า",
      en: "Import",
    },
    condition: {
      th: conditionTh,
      en: conditionEn,
    },
    effective_date: formatBilingualDate(rawStartDate),
    expiry_date: formatBilingualDate(rawEndDate),
  };

  flatPermitsList.push(record);

  if (!permitsByHs[rawHs]) {
    permitsByHs[rawHs] = [];
  }
  permitsByHs[rawHs].push(record);
}

// Write Output JSONs
fs.writeFileSync(
  path.join(resolvedOutputDir, "electronic_permits_flat.json"),
  JSON.stringify(flatPermitsList, null, 2),
  "utf8",
);
fs.writeFileSync(
  path.join(resolvedOutputDir, "electronic_permits_by_hscode.json"),
  JSON.stringify(permitsByHs, null, 2),
  "utf8",
);

console.log(`\n======================================================`);
console.log(`==> Filtering completed successfully: ${resolvedOutputDir}`);
console.log(`   - flat records : ${flatPermitsList.length}`);
console.log(`   - unique HS    : ${Object.keys(permitsByHs).length}`);
console.log(`======================================================`);
