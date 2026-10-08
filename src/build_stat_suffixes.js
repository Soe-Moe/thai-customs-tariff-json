#!/usr/bin/env node

// REFDRT splits some 8-digit tariff lines into parts by a trailing note
// ("เฉพาะโคโพลิเมอร์" / "อื่นๆ") but carries no statistical suffix for them.
// The ITD portal shows each part as its own 10-digit line (3906.909901,
// 3906.909929), so this fetches every split HS code from the portal, in Thai
// and English, and saves suffix + text per part for the rate builders.
//
//   node src/build_stat_suffixes.js [-b ./src/raw-data] [--delay 500] [--concurrency 2] [--refresh] [-c 39069099,...]
//
// Writes <base-dir>/stat_suffixes.json after every batch, so an interrupted
// run resumes where it stopped. Exit codes: 0 = written, 2 = portal
// unreachable or its page layout changed.

const fs = require("fs");
const path = require("path");
const { requireRawFiles } = require("./lib/raw_file");
const { readDutyLines } = require("./lib/duty_rates");
const { writeJson } = require("./lib/output");
const {
  STAT_SUFFIX_FILE,
  loadBaseDescriptions,
  parseLineNote,
  isSplitNote,
} = require("./lib/tariff_lines");

const PORTAL = "http://itd.customs.go.th/igtf/viewerImportTariff.do";
const SAVE_EVERY = 20;

function parseCliArgs(argv) {
  const opts = {
    baseDir: "./src/raw-data",
    delayMs: 500,
    concurrency: 2,
    refresh: false,
    hsCodes: null,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "-h" || argv[i] === "--help") {
      console.log(
        "Usage: node src/build_stat_suffixes.js [-b <raw-data-folder>] [--delay <ms>] [--concurrency <n>] [--refresh] [-c <hs,hs,...>]",
      );
      process.exit(0);
    } else if (argv[i] === "-b" || argv[i] === "--base-dir") {
      opts.baseDir = argv[++i];
    } else if (argv[i] === "--delay") {
      opts.delayMs = parseInt(argv[++i], 10);
    } else if (argv[i] === "--concurrency") {
      opts.concurrency = Math.max(1, parseInt(argv[++i], 10));
    } else if (argv[i] === "--refresh") {
      opts.refresh = true;
    } else if (argv[i] === "-c" || argv[i] === "--codes") {
      opts.hsCodes = argv[++i].split(",").map((c) => c.replace(/\D/g, ""));
    }
  }
  opts.baseDir = path.resolve(process.cwd(), opts.baseDir);
  return opts;
}

// The portal's date field wants dd/mm/yyyy in the Buddhist Era.
function todayBuddhistEra() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("day")}/${get("month")}/${Number(get("year")) + 543}`;
}

async function openSession() {
  const res = await fetch(`${PORTAL}?param=main`);
  if (!res.ok) throw new Error(`portal returned HTTP ${res.status}`);
  const cookies = res.headers.getSetCookie?.() ?? [];
  return cookies.map((c) => c.split(";")[0]).join("; ");
}

async function fetchRates(cookie, hsCode, lang, date) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(PORTAL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          ...(cookie && { Cookie: cookie }),
        },
        body: new URLSearchParams({
          param: "display1",
          key2: hsCode,
          lang,
          docBegnDate: date,
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt >= 3) throw new Error(`HS ${hsCode} (${lang}): ${err.message}`);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
}

function cleanCell(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// suffix -> { text, privileges } from every rate table on the page. Each
// table starts with a heading like "000 : อัตราอากร..." or "AK3 : อาเซียน-เกาหลี",
// and each row is: [heading] | 10-digit code | description | rates ...
// The same part can carry different suffixes under different privileges
// (8414.809002 under 000 is 8414.809071 under WTO), hence the privileges.
function parseSuffixRows(html, hsCode) {
  const rows = new Map();
  const body = html.replace(/<!--[\s\S]*?-->/g, " ");
  const sections = body.split(/(?<![\w.])([0-9A-Z]{3})\s+:\s/);
  for (let i = 1; i < sections.length; i += 2) {
    const privilegeCode = sections[i];
    for (const [, tr] of sections[i + 1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
        cleanCell(m[1]),
      );
      const codeIndex = cells.findIndex((c) => /^\d{4}\.\d{6}$/.test(c));
      if (codeIndex === -1 || codeIndex + 1 >= cells.length) continue;
      const code = cells[codeIndex].replace(".", "");
      if (!code.startsWith(hsCode)) continue;
      const suffix = code.substring(8);
      const text = cells[codeIndex + 1].replace(/^(?:-\s*)+/, "").trim();
      if (suffix === "00" || !text) continue;
      if (!rows.has(suffix)) rows.set(suffix, { text, privileges: new Set() });
      rows.get(suffix).privileges.add(privilegeCode);
    }
  }
  return rows;
}

// HS codes whose REFDRT lines carry a note naming only part of the tariff line
function findSplitCodes(files) {
  const baseDescriptions = loadBaseDescriptions(files.tariff);
  const codes = new Set();
  for (const line of readDutyLines(files.duty)) {
    const hs8 = line.substring(4, 12);
    if (isSplitNote(parseLineNote(line), baseDescriptions.get(hs8))) codes.add(hs8);
  }
  return [...codes].sort();
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  const files = requireRawFiles(opts.baseDir, ["duty", "tariff"]);
  const outFile = path.join(opts.baseDir, STAT_SUFFIX_FILE);
  const date = todayBuddhistEra();

  const saved =
    !opts.refresh && fs.existsSync(outFile)
      ? JSON.parse(fs.readFileSync(outFile, "utf8"))
      : { codes: {} };
  const codes = saved.codes;

  const wanted = opts.hsCodes ?? findSplitCodes(files);
  const todo = wanted.filter((c) => opts.hsCodes || !(c in codes));
  console.log(
    `==> ${wanted.length} split HS code(s), ${todo.length} to fetch from ${PORTAL} (${date})`,
  );

  const save = () => {
    const sorted = Object.fromEntries(
      Object.keys(codes)
        .sort()
        .map((k) => [k, codes[k]]),
    );
    writeJson(outFile, { source: PORTAL, fetched_on: date, codes: sorted });
  };

  const cookie = await openSession();
  let done = 0;
  let next = 0;

  async function worker() {
    while (next < todo.length) {
      const hsCode = todo[next++];
      const th = parseSuffixRows(await fetchRates(cookie, hsCode, "t", date), hsCode);
      await new Promise((r) => setTimeout(r, opts.delayMs));
      const en = parseSuffixRows(await fetchRates(cookie, hsCode, "e", date), hsCode);
      await new Promise((r) => setTimeout(r, opts.delayMs));

      codes[hsCode] = [...th]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([suffix, { text, privileges }]) => ({
          suffix,
          th: text,
          en: en.get(suffix)?.text ?? null,
          privileges: [...privileges].sort(),
        }));

      done++;
      if (done % SAVE_EVERY === 0) {
        save();
        console.log(`   ${done}/${todo.length} fetched`);
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: opts.concurrency }, worker));
  } finally {
    save();
  }

  const fetched = todo.map((c) => codes[c]);
  if (todo.length >= 20 && fetched.every((rows) => rows.length === 0)) {
    console.error("\n==> No suffixed rows parsed. The portal page layout may have changed.");
    process.exit(2);
  }
  const empty = todo.filter((c) => codes[c].length === 0);
  console.log(`\n==> Statistical suffixes written to: ${outFile}`);
  console.log(`   ${Object.keys(codes).length} HS codes, ${empty.length} of this run had no suffixed rows on the portal`);
}

main().catch((err) => {
  console.error(`==> Suffix fetch failed: ${err.message}`);
  process.exit(2);
});
