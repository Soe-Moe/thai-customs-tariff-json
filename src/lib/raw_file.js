const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const iconv = require("iconv-lite");

// Raw ITD master file names (each may also be stored as <name>.gz)
const RAW_FILES = {
  duty: "REFDRT_Open_20220101.txt",
  tariff: "REFTRC_Open.txt",
  privilege: "REFPRV_Open.txt",
  permit: "REFPMG_Open.txt",
};

// Resolve a raw data file path, falling back to its gzipped version (<file>.gz)
function resolveRawFile(filePath) {
  if (fs.existsSync(filePath)) return filePath;
  if (fs.existsSync(`${filePath}.gz`)) return `${filePath}.gz`;
  return null;
}

function rawFileExists(filePath) {
  return resolveRawFile(filePath) !== null;
}

// Read a raw data file (.txt or .txt.gz) and decode it from TIS-620
function readRawText(filePath) {
  const resolved = resolveRawFile(filePath);
  if (!resolved) {
    console.error(`Error: Raw data file not found: ${filePath}(.gz)`);
    process.exit(1);
  }
  let buffer = fs.readFileSync(resolved);
  if (resolved.endsWith(".gz")) buffer = zlib.gunzipSync(buffer);
  return iconv.decode(buffer, "tis-620");
}

// Paths of the given RAW_FILES entries in baseDir; exits if any of them is missing
function requireRawFiles(baseDir, keys) {
  const files = {};
  const missing = [];
  for (const key of keys) {
    files[key] = path.join(baseDir, RAW_FILES[key]);
    if (!rawFileExists(files[key])) missing.push(RAW_FILES[key]);
  }
  if (missing.length > 0) {
    console.error(
      `Error: Required files are missing in ${baseDir}: ${missing.join(", ")}`,
    );
    process.exit(1);
  }
  return files;
}

module.exports = {
  RAW_FILES,
  resolveRawFile,
  rawFileExists,
  readRawText,
  requireRawFiles,
};
