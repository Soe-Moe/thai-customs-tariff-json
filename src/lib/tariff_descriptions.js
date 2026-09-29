const { readRawText } = require("./raw_file");

const UNKNOWN_DESCRIPTION = {
  th: "- - รายการตามพิกัด",
  en: "- - Tariff Item Description",
};

// Build a HS code -> { th, en } description map from REFTRC.
// Each line is keyed by its 10-digit code, and by its 8-digit code for the first line seen.
function loadDescriptionMap(tariffFile) {
  const trcLines = readRawText(tariffFile)
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 10);
  const descriptionMap = new Map();

  for (const line of trcLines) {
    const hsMatch = line.match(/^(\d{8,11})/);
    if (!hsMatch) continue;

    const rawHs = hsMatch[1];
    const hs8 = rawHs.substring(0, 8);
    const hs10 = rawHs.length >= 10 ? rawHs.substring(0, 10) : hs8;

    const thaiMatches = line.match(/([฀-๿\s\-()–—.+%/]+)/g);
    const descTh = thaiMatches
      ? thaiMatches
          .map((s) => s.trim())
          .filter((s) => s.length > 1)
          .join(" ")
          .trim()
      : "";

    const engMatches = line.match(/([a-zA-Z\s\-(),.+%/]{3,})/g);
    const descEn = engMatches
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

  return descriptionMap;
}

function getDescription(descriptionMap, hsCode) {
  const desc = descriptionMap.get(hsCode) || UNKNOWN_DESCRIPTION;
  return { th: desc.th, en: desc.en };
}

module.exports = { loadDescriptionMap, getDescription };
