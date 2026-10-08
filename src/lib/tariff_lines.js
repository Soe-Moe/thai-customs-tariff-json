const fs = require("fs");
const path = require("path");
const { readRawText } = require("./raw_file");
const { readDutyLines } = require("./duty_rates");

// Portal-scraped statistical suffixes, written by build_stat_suffixes.js
const STAT_SUFFIX_FILE = "stat_suffixes.json";

// REFTRC has no dash indents, so derive them from the HS code structure:
//   Subheading (digits 5-6): "00" = not subdivided (0), "x0" = one dash (1),
//     "xy" = two dashes (2), under an unnumbered one-dash group (e.g. "- Brazil nuts:")
//   National (digits 7-8): "00" = same line as the subheading, "x0" = +1,
//     "xy" = +2, under an unnumbered group (e.g. "- - - Other:")
function getIndent(rawHs8) {
  const levelOf = (pair) => (pair === "00" ? 0 : pair[1] === "0" ? 1 : 2);
  return levelOf(rawHs8.substring(4, 6)) + levelOf(rawHs8.substring(6, 8));
}

function withIndent(desc, indent) {
  return indent > 0 ? `${"- ".repeat(indent)}${desc}` : desc;
}

// Comparison key for descriptions: the raw files drop the spaces the portal
// shows ("อื่นๆ" vs "อื่น ๆ", "Polyacrylamide" vs "Poly acryl amide")
function normalizeText(text) {
  return (text || "").replace(/^(?:-\s*)+/, "").replace(/[\s\-]/g, "");
}

// REFTRC fixed-width layout (6028 chars per line, 8-digit tariff lines only):
//   [4,12) HS code   [12,3012) Thai description   [3012,6012) English description
function loadBaseDescriptions(tariffFile) {
  const map = new Map();
  for (const line of readRawText(tariffFile).split(/\r?\n/)) {
    const hs8 = line.substring(4, 12);
    if (!/^\d{8}$/.test(hs8) || map.has(hs8)) continue;
    map.set(hs8, {
      th: line.substring(12, 3012).trim(),
      en: line.substring(3012, 6012).trim(),
    });
  }
  return map;
}

// Text after the last date pair of a REFDRT line narrows the rate to part of
// the tariff line (e.g. "เฉพาะโคโพลิเมอร์"); on unsplit lines it repeats the
// tariff line description
function parseLineNote(line) {
  const datePairs = [...line.matchAll(/(20\d{6})(20\d{6}|99999999)/g)];
  const lastPair = datePairs[datePairs.length - 1];
  if (!lastPair) return "";
  return line.substring(lastPair.index + lastPair[0].length).trim();
}

// True when the note names only part of the tariff line, i.e. the line has
// its own statistical suffix on the portal
function isSplitNote(note, baseDescription) {
  return (
    normalizeText(note) !== "" &&
    normalizeText(note) !== normalizeText(baseDescription?.th)
  );
}

// "<hs8>_<privilege>" -> Map(normalized Thai note -> { suffix, th, en }) for
// every privilege the portal shows split into parts. A part's suffix depends
// on the privilege: 8414.809002 under 000 is 8414.809071 under WTO.
function loadStatSuffixes(baseDir) {
  const file = path.join(baseDir, STAT_SUFFIX_FILE);
  const map = new Map();
  if (!fs.existsSync(file)) {
    console.warn(
      `Warning: ${file} not found; split tariff lines keep the "00" suffix (run \`npm run build:stat-suffixes\`)`,
    );
    return map;
  }
  const { codes } = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [hs8, rows] of Object.entries(codes)) {
    for (const row of rows) {
      for (const privilegeCode of row.privileges) {
        const key = `${hs8}_${privilegeCode}`;
        if (!map.has(key)) map.set(key, new Map());
        map.get(key).set(normalizeText(row.th), row);
      }
    }
  }
  return map;
}

// "<hs8>_<privilege>" groups where at least one REFDRT line matches a part
// the portal shows. Where none does, the portal reworded the parts
// ("เฉพาะข้าวโพดเลี้ยงสัตว์" vs "อื่น ๆ นอกจากข้าวโพดเลี้ยงสัตว์"), and the
// lines are kept whole rather than losing the privilege's rate.
function loadMatchedGroups(dutyFile, statSuffixes) {
  const groups = new Set();
  for (const line of readDutyLines(dutyFile)) {
    const key = `${line.substring(4, 12)}_${line.substring(17, 20).trim()}`;
    if (statSuffixes.get(key)?.has(normalizeText(parseLineNote(line)))) {
      groups.add(key);
    }
  }
  return groups;
}

// Resolves one REFDRT line to its 10-digit tariff line, or null to drop it.
// Where the portal shows the privilege split into parts (3906.909901
// copolymers / 3906.909929 others under 000), each line takes its part's
// suffix and bilingual text, and a line matching no part is dropped: the
// portal lists only the parts. Elsewhere the line is whole and keeps "00",
// including notes the portal shows no part for (an expired part, a date
// range such as "นำเข้าตั้งแต่วันที่1เมษายน2565", a reworded description).
function createTariffLineResolver(baseDir, files) {
  const baseDescriptions = loadBaseDescriptions(files.tariff);
  const statSuffixes = loadStatSuffixes(baseDir);
  const matchedGroups = loadMatchedGroups(files.duty, statSuffixes);
  const dropped = new Set();
  const unresolved = new Set();

  function resolve(hs8, privilegeCode, note) {
    const base = baseDescriptions.get(hs8) || { th: "", en: "" };
    const indent = getIndent(hs8);
    let suffix = "00";
    let th = base.th;
    let en = base.en;

    const group = `${hs8}_${privilegeCode}`;
    const parts = matchedGroups.has(group) && statSuffixes.get(group);
    if (parts) {
      const match = parts.get(normalizeText(note));
      if (!match) {
        dropped.add(`${hs8} ${privilegeCode} ${note}`);
        return null;
      }
      // The portal leaves English blank on some parts; keep the line's own
      ({ suffix, th } = match);
      en = match.en || base.en;
    } else if (isSplitNote(note, base)) {
      unresolved.add(`${hs8} ${note}`);
    }

    return {
      tariff_code: `${hs8.substring(0, 4)}.${hs8.substring(4, 8)}${suffix}`,
      description: {
        th: withIndent(th, indent),
        en: withIndent(en, indent),
      },
    };
  }

  function logUnresolved() {
    if (dropped.size > 0) {
      console.log(
        `   ${dropped.size} line(s) matched none of the parts the portal shows and were dropped (e.g. ${[...dropped][0]})`,
      );
    }
    if (unresolved.size > 0) {
      console.log(
        `   ${unresolved.size} note(s) had no part on the portal and count as the whole line (e.g. ${[...unresolved][0]})`,
      );
    }
  }

  return { resolve, logUnresolved };
}

module.exports = {
  STAT_SUFFIX_FILE,
  getIndent,
  withIndent,
  normalizeText,
  loadBaseDescriptions,
  parseLineNote,
  isSplitNote,
  loadStatSuffixes,
  createTariffLineResolver,
};
