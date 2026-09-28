#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { rawFileExists, readRawText } = require("./lib/raw_file");

// Parse CLI arguments
const args = process.argv.slice(2);
let baseDir = "./src/raw-data";
let outputPath = "./output/fta_privilege_dictionary.json";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "-b" || args[i] === "--base-dir") {
    baseDir = args[++i];
  } else if (args[i] === "-o" || args[i] === "--output") {
    outputPath = args[++i];
  } else if (args[i] === "-h" || args[i] === "--help") {
    console.log(`
Usage:
  node extract_fta_privilege_codes.js [-b <raw-data-folder>] [-o <output-file.json>]

Default:
  -b ./src/raw-data
  -o ./output/fta_privilege_dictionary.json
    `);
    process.exit(0);
  }
}

const resolvedBaseDir = path.resolve(process.cwd(), baseDir);
const resolvedOutputPath = path.resolve(process.cwd(), outputPath);
const patchesDir = path.join(resolvedBaseDir, "patches");
const masterPrvFile = path.join(resolvedBaseDir, "REFPRV_Open.txt");

if (!rawFileExists(masterPrvFile)) {
  console.error(
    `Error: Base Privilege Master file not found: ${masterPrvFile}`,
  );
  process.exit(1);
}

const multilateralCodes = new Map();
const bilateralCodes = new Map();

// Helper: classify a code as Multilateral or Bilateral
function registerPrivilege(
  code,
  rawDescTh,
  rawDescEn = "",
  sourceFile = "Master",
) {
  if (!code || code.length < 3) return;
  const cleanCode = code.trim().toUpperCase();

  // ATIGA (excluded, since it applies only among ASEAN member states)
  if (cleanCode === "ATG" || cleanCode === "ASC") return;

  // Multilateral Condition (RCEP, ASEAN+1 Frameworks: AAN, ACN, AHK, AIN, AJ, AK, etc.)
  const isRcep =
    cleanCode.startsWith("R") ||
    rawDescTh.includes("RCEP") ||
    rawDescEn.includes("RCEP");
  const isAseanPlus =
    cleanCode.startsWith("A") ||
    rawDescTh.includes("อาเซียน-") ||
    rawDescTh.includes("ASEAN-") ||
    rawDescEn.includes("ASEAN-");

  // Bilateral Condition (JTEPA J1E-J3P/TJ, TAFTA, TCFTA, TNZCEP, TPFTA, Thai-India, etc.)
  const isBilateralFta =
    cleanCode.startsWith("J") ||
    cleanCode.startsWith("TJ") ||
    cleanCode.startsWith("TA") ||
    cleanCode.startsWith("TC") ||
    cleanCode.startsWith("TN") ||
    cleanCode.startsWith("TI") ||
    cleanCode.startsWith("TP") ||
    cleanCode.startsWith("TCL") ||
    rawDescTh.includes("ไทย-") ||
    rawDescTh.includes("ญี่ปุ่น") ||
    rawDescTh.includes("JTEPA") ||
    rawDescTh.includes("TAFTA") ||
    rawDescTh.includes("ออสเตรเลีย") ||
    rawDescTh.includes("TNZCEP") ||
    rawDescTh.includes("นิวซีแลนด์") ||
    rawDescTh.includes("TPFTA") ||
    rawDescTh.includes("เปรู") ||
    rawDescTh.includes("ชิลี") ||
    rawDescEn.includes("JAPAN") ||
    rawDescEn.includes("AUSTRALIA") ||
    rawDescEn.includes("NEW ZEALAND") ||
    rawDescEn.includes("PERU") ||
    rawDescEn.includes("CHILE");

  const record = {
    code: cleanCode,
    description_th: rawDescTh.trim(),
    description_en: rawDescEn.trim() || cleanCode,
    source: sourceFile,
  };

  if (isRcep || isAseanPlus) {
    if (!multilateralCodes.has(cleanCode)) {
      multilateralCodes.set(cleanCode, {
        ...record,
        category: "FTA พหุภาคี (Multilateral)",
      });
    }
  } else if (isBilateralFta) {
    if (!bilateralCodes.has(cleanCode)) {
      bilateralCodes.set(cleanCode, {
        ...record,
        category: "FTA ทวิภาคี (Bilateral)",
      });
    }
  }
}

// ==========================================
// 1. Read the Base Master File (REFPRV_Open.txt)
// ==========================================
console.log(
  `==> [1/2] Reading Base Privilege Master: ${path.basename(masterPrvFile)}`,
);
const prvText = readRawText(masterPrvFile);
const prvLines = prvText.split(/\r?\n/).filter((l) => l.trim().length > 5);

for (let i = 0; i < prvLines.length; i++) {
  const line = prvLines[i];
  const code = line.substring(0, 3).trim();
  const remaining = line.substring(3).trim();
  const dateMatch = remaining.search(/\b20\d{6}\b/);
  const rawDesc =
    dateMatch !== -1
      ? remaining.substring(0, dateMatch).trim()
      : remaining.substring(0, 120).trim();
  registerPrivilege(code, rawDesc, "", "REFPRV_Open.txt");
}

// ==========================================
// 2. Read files in the Patches folder
// ==========================================
if (fs.existsSync(patchesDir)) {
  const patchFiles = fs
    .readdirSync(patchesDir)
    .filter((f) => /\.txt(\.gz)?$/i.test(f));
  console.log(
    `==> [2/2] Checking Patches folder: found ${patchFiles.length} file(s)`,
  );

  patchFiles.forEach((file) => {
    const fullPath = path.join(patchesDir, file);
    const content = readRawText(fullPath);
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 5);

    // Extract the code from the file name (e.g. REFPVC_Open_J1E.txt -> J1E)
    let fileCodeMatch = file.match(/_([A-Z0-9]{3})\.txt(\.gz)?$/i);
    let patchCode = fileCodeMatch ? fileCodeMatch[1].toUpperCase() : null;

    lines.forEach((line) => {
      // Capture the code from the first 3 characters of the line
      const lineCode = line.substring(0, 3).trim();
      const code =
        lineCode && lineCode.length === 3 && /^[A-Z0-9]+$/i.test(lineCode)
          ? lineCode.toUpperCase()
          : patchCode;

      if (!code) return;

      // Extract the Thai and English descriptions from the line
      const remaining = line.substring(3).trim();

      // Thai text match
      const thaiMatch = remaining.match(/([\u0E00-\u0E7F\s\-()–—.+%/0-9]+)/);
      const descTh = thaiMatch ? thaiMatch[1].trim() : "";

      // English text match (e.g. EXEMPTION AND REDUCTION OF CUSTOMS DUTY...)
      const engMatch = remaining.match(/([A-Z\s\-(),.+%/0-9]{10,})/);
      const descEn = engMatch ? engMatch[1].trim() : "";

      registerPrivilege(code, descTh || code, descEn, file.replace(/\.gz$/i, ""));
    });
  });
} else {
  console.log(`==> Patches folder not found (using Base Master only)`);
}

// Sorting and Output Object
const multiList = Array.from(multilateralCodes.values()).sort((a, b) =>
  a.code.localeCompare(b.code),
);
const biList = Array.from(bilateralCodes.values()).sort((a, b) =>
  a.code.localeCompare(b.code),
);

const outputData = {
  metadata: {
    generated_at: new Date().toISOString(),
    total_multilateral: multiList.length,
    total_bilateral: biList.length,
  },
  multilateral_codes: multiList.map((item) => item.code),
  bilateral_codes: biList.map((item) => item.code),
  dictionary: {
    multilateral: Object.fromEntries(multilateralCodes),
    bilateral: Object.fromEntries(bilateralCodes),
  },
};

// Write JSON output
fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
fs.writeFileSync(
  resolvedOutputPath,
  JSON.stringify(outputData, null, 2),
  "utf8",
);

console.log(`\n======================================================`);
console.log(`==> Extracted and saved successfully: ${resolvedOutputPath}`);
console.log(`==> Multilateral Codes (${multiList.length}):`);
console.log(`    ${outputData.multilateral_codes.join(", ")}`);
console.log(`==> Bilateral Codes (${biList.length}):`);
console.log(`    ${outputData.bilateral_codes.join(", ")}`);
console.log(`======================================================`);
