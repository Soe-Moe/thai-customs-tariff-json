const { readRawText } = require("./raw_file");

function readPrivilegeLines(prvFile) {
  return readRawText(prvFile)
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 5);
}

// REFPRV line: [0,3) privilege code, then the Thai title up to its first date
// (or maxLength chars when the line has no date)
function parsePrivilegeLine(line, maxLength) {
  const remaining = line.substring(3).trim();
  const dateMatch = remaining.search(/\b20\d{6}\b/);
  return {
    code: line.substring(0, 3).trim(),
    descTh:
      dateMatch !== -1
        ? remaining.substring(0, dateMatch).trim()
        : remaining.substring(0, maxLength).trim(),
  };
}

// Privilege code -> Thai title for codes matching codePattern, with fallbacks for codes REFPRV lacks
function loadPrivilegeTitles(prvFile, codePattern, fallbackTitles) {
  const titles = new Map();
  for (const line of readPrivilegeLines(prvFile)) {
    const { code, descTh } = parsePrivilegeLine(line, 180);
    if (codePattern.test(code)) titles.set(code, descTh);
  }
  for (const [code, title] of Object.entries(fallbackTitles)) {
    if (!titles.has(code)) titles.set(code, title);
  }
  return titles;
}

module.exports = { readPrivilegeLines, parsePrivilegeLine, loadPrivilegeTitles };
