const fs = require("fs");
const path = require("path");
const { todayInt } = require("./dates");

// Options a build script can accept; a script opts in by giving a default for the key
const OPTIONS = {
  baseDir: { flags: ["-b", "--base-dir"], arg: "<raw-data-folder>", isPath: true },
  input: { flags: ["-i", "--input"], arg: "<input-file>", isPath: true },
  outputDir: { flags: ["-o", "--output-dir"], arg: "<output-folder>", isPath: true },
  outputFile: { flags: ["-o", "--output"], arg: "<output-file.json>", isPath: true },
  date: { flags: ["-d", "--date"], arg: "<YYYYMMDD>", isPath: false },
};

function printUsage(scriptName, keys, defaults) {
  const usage = keys.map((k) => `[${OPTIONS[k].flags[0]} ${OPTIONS[k].arg}]`);
  const lines = keys.map(
    (k) => `  ${OPTIONS[k].flags[0]} ${k === "date" ? "today" : defaults[k]}`,
  );
  console.log(`
Usage:
  node ${scriptName} ${usage.join(" ")}

Default:
${lines.join("\n")}
    `);
}

// Parse CLI arguments into { baseDir, outputDir, ... } with paths resolved against the cwd.
// A `date` option (reference date for "currently active" rates) is returned as a YYYYMMDD integer.
function parseArgs(scriptName, defaults) {
  const keys = Object.keys(defaults);
  const values = { ...defaults };
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-h" || args[i] === "--help") {
      printUsage(scriptName, keys, defaults);
      process.exit(0);
    }
    const key = keys.find((k) => OPTIONS[k].flags.includes(args[i]));
    if (key) values[key] = args[++i];
  }

  for (const key of keys) {
    if (OPTIONS[key].isPath) values[key] = path.resolve(process.cwd(), values[key]);
  }

  if ("date" in values) {
    if (values.date === null) {
      values.date = todayInt();
    } else if (/^\d{8}$/.test(values.date)) {
      values.date = parseInt(values.date, 10);
    } else {
      console.error(`Error: --date must be YYYYMMDD, got: ${values.date}`);
      process.exit(1);
    }
  }

  if (values.outputDir) fs.mkdirSync(values.outputDir, { recursive: true });
  if (values.outputFile)
    fs.mkdirSync(path.dirname(values.outputFile), { recursive: true });

  return values;
}

module.exports = { parseArgs };
