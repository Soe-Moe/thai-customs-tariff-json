const fs = require("fs");
const path = require("path");

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

// Write each { fileName: data } entry into outputDir as pretty-printed JSON
function writeJsonFiles(outputDir, files) {
  for (const [fileName, data] of Object.entries(files)) {
    writeJson(path.join(outputDir, fileName), data);
  }
}

// Group records into { [record[key]]: [records...] }, keeping their order
function groupBy(records, key) {
  const grouped = {};
  records.forEach((r) => {
    if (!grouped[r[key]]) grouped[r[key]] = [];
    grouped[r[key]].push(r);
  });
  return grouped;
}

module.exports = { writeJson, writeJsonFiles, groupBy };
