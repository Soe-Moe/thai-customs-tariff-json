const fs = require("fs");
const zlib = require("zlib");
const iconv = require("iconv-lite");

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

module.exports = { resolveRawFile, rawFileExists, readRawText };
