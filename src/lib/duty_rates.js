const { readRawText } = require("./raw_file");

const UNIT_MAP = {
  KGM: { th: "กิโลกรัม", en: "Kilogram" },
  LTR: { th: "ลิตร", en: "Litre" },
  MTR: { th: "เมตร", en: "Metre" },
  NMB: { th: "จำนวน", en: "Number / Units" },
  C62: { th: "ตัว / หน่วย", en: "Head / Pieces" },
  TNE: { th: "ตัน", en: "Tonne" },
};

function readDutyLines(dutyFile) {
  return readRawText(dutyFile)
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 30);
}

// REFDRT line key fields: [4,12) HS code, [12,17) tariff sequence, [17,20) privilege code
function parseDutyKey(line) {
  const tariffSeqStr = line.substring(12, 17).trim();
  return {
    hsCode: line.substring(4, 12).trim(),
    tariffSeqStr,
    tariffSeq: parseInt(tariffSeqStr, 10) || 0,
    privilegeCode: line.substring(17, 20).trim(),
  };
}

// Ad valorem rate, specific rate and specific unit, read by pattern from the rate columns
function parseDutyRates(line) {
  const adValoremMatch = line.substring(21, 45).match(/(\d{1,3}\.\d{2,3})/);
  const specificMatch = line.substring(45, 65).match(/(\d{1,4}\.\d{2,3})/);
  const unitMatch = line.substring(55, 75).match(/\b(KGM|LTR|NMB|TNE)\b/);
  const unitCode = unitMatch ? unitMatch[1] : "";
  return {
    adValoremRate: adValoremMatch ? parseFloat(adValoremMatch[1]) : 0.0,
    specificRate: specificMatch ? parseFloat(specificMatch[1]) : 0.0,
    unitInfo: UNIT_MAP[unitCode] || {
      th: unitCode || "-",
      en: unitCode || "-",
    },
  };
}

// The last 16-digit date pair (start YYYYMMDD + end YYYYMMDD or 99999999) on the line
function parseDateRange(line) {
  const allDatePairs = [...line.matchAll(/(20\d{6})(20\d{6}|99999999)/g)];
  let rawStartDate = "20220101";
  let rawEndDate = "99999999";

  if (allDatePairs.length > 0) {
    const lastPair = allDatePairs[allDatePairs.length - 1];
    rawStartDate = lastPair[1];
    rawEndDate = lastPair[2];
  }

  return {
    rawStartDate,
    rawEndDate,
    startInt: parseInt(rawStartDate, 10),
    endInt: parseInt(rawEndDate, 10),
  };
}

function isActiveOn(dateRange, dateInt) {
  return dateInt >= dateRange.startInt && dateInt <= dateRange.endInt;
}

// Legal reference text starting at `marker`, up to the first date (or maxLength chars)
function extractLegalRef(line, marker, maxLength) {
  const refIndex = line.indexOf(marker);
  if (refIndex === -1) return null;
  const tailPart = line.substring(refIndex);
  const dateIndex = tailPart.search(/\b(20\d{6}|99999999)\b/);
  return (
    dateIndex !== -1
      ? tailPart.substring(0, dateIndex)
      : tailPart.substring(0, maxLength)
  ).trim();
}

// "5.000" for whole numbers, "2.5" otherwise
function formatRate(rate) {
  return rate % 1 === 0 ? `${rate.toFixed(3)}` : `${rate}`;
}

// "5%" for whole numbers, "2.5%" otherwise
function formatRatePercent(rate) {
  return rate % 1 === 0
    ? `${rate}%`
    : `${rate.toFixed(3).replace(/\.?0+$/, "")}%`;
}

// Thai / English display text for a rate, prefixed with "** " when a condition applies
function formatDutyDisplay(isExempt, hasCondition, rateTextTh, rateTextEn) {
  const prefix = hasCondition ? "** " : "";
  return {
    display_th: `${prefix}${isExempt ? "ยกเว้นอากร" : rateTextTh}`,
    display_en: `${prefix}${isExempt ? "Duty Exempted" : rateTextEn}`,
  };
}

// Keep one record per key: prefer an active record (the latest-starting one among active),
// otherwise the one with the highest tariff sequence
function keepPreferredRecord(map, key, record, tariffSeq) {
  const existing = map.get(key);
  if (
    !existing ||
    (!existing._is_active && record._is_active) ||
    (existing._is_active &&
      record._is_active &&
      record._start_int >= existing._start_int) ||
    (!existing._is_active &&
      !record._is_active &&
      tariffSeq > parseInt(existing.tariff_seq, 10))
  ) {
    map.set(key, record);
  }
}

// Remove the internal _is_active / _start_int fields used by keepPreferredRecord
function stripInternalFields(records) {
  return records.map(({ _is_active, _start_int, ...clean }) => clean);
}

module.exports = {
  UNIT_MAP,
  readDutyLines,
  parseDutyKey,
  parseDutyRates,
  parseDateRange,
  isActiveOn,
  extractLegalRef,
  formatRate,
  formatRatePercent,
  formatDutyDisplay,
  keepPreferredRecord,
  stripInternalFields,
};
