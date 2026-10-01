#!/usr/bin/env node

// REFTRC only carries 8-digit tariff lines, so heading (4-digit) and
// subheading (6-digit) titles come from the ITD portal's search page, one
// request per chapter.
//
//   node src/build_hs_headings.js [-o ./output/hs_headings_json] [--delay 1000]
//
// Exit codes: 0 = written, 2 = portal unreachable or its page layout changed.

const fs = require("fs");
const path = require("path");
const { writeJsonFiles } = require("./lib/output");

const PORTAL = "http://itd.customs.go.th/igtf/viewerImportTariff.do";
const CATALOG_FILE = "./output/hs_catalog_json/hs_catalog_full_list.json";

function parseCliArgs(argv) {
  const opts = { outputDir: "./output/hs_headings_json", delayMs: 1000 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "-h" || argv[i] === "--help") {
      console.log(
        "Usage: node src/build_hs_headings.js [-o <output-folder>] [--delay <ms>]",
      );
      process.exit(0);
    } else if (argv[i] === "-o" || argv[i] === "--output-dir") {
      opts.outputDir = argv[++i];
    } else if (argv[i] === "--delay") {
      opts.delayMs = parseInt(argv[++i], 10);
    }
  }
  opts.outputDir = path.resolve(process.cwd(), opts.outputDir);
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

async function searchChapter(cookie, chapter, date) {
  const res = await fetch(PORTAL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(cookie && { Cookie: cookie }),
    },
    body: new URLSearchParams({
      param: "search",
      taffCode: chapter,
      lang: "t",
      docBegnDate: date,
    }),
  });
  if (!res.ok) throw new Error(`chapter ${chapter}: portal returned HTTP ${res.status}`);
  return res.text();
}

// The portal replaces curly quotes with "?": `?split-system?`, `collectors? pieces`.
// Tariff descriptions never contain a real question mark.
function cleanText(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\?(\S[^?]*?\S)\?/g, '"$1"')
    .replace(/(\p{L})\?/gu, "$1'")
    .replace(/"\?/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// Each result row is: code link | Thai description | English description.
// Rows without a link are unnumbered groups ("- - - Other:") and are skipped.
// A heading with no 6-digit split is listed as "0508.00" instead of "05.08".
function parseRows(html) {
  const rows = [];
  for (const [, tr] of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    let code = tr.match(/searchTaff\('(\d+)'\)/)?.[1];
    if (!code || (code.length !== 4 && code.length !== 6)) continue;
    if (code.length === 6 && code.endsWith("00")) code = code.slice(0, 4);
    const cells = [...tr.matchAll(/<td\s*>([\s\S]*?)<\/td>/g)].map((m) =>
      cleanText(m[1]),
    );
    if (cells.length < 2) continue;
    const [rawTh, rawEn] = cells.slice(-2);
    const dashes = rawTh.match(/^(?:-\s*)+/)?.[0] ?? "";
    rows.push({
      raw_code: code,
      level: code.length === 4 ? "heading" : "subheading",
      description_th: rawTh.slice(dashes.length).trim(),
      description_en: rawEn.replace(/^(?:-\s*)+/, "").trim(),
    });
  }
  return rows;
}

function dotted(code) {
  return code.length === 4
    ? `${code.slice(0, 2)}.${code.slice(2)}`
    : `${code.slice(0, 4)}.${code.slice(4)}`;
}

async function main() {
  const { outputDir, delayMs } = parseCliArgs(process.argv.slice(2));
  if (!fs.existsSync(CATALOG_FILE)) {
    console.error(`Error: ${CATALOG_FILE} not found; run \`npm run build:hs-catalog\` first`);
    process.exit(2);
  }
  const catalog = JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8"));
  const chapters = [...new Set(catalog.map((item) => item.chapter))].sort();
  const date = todayBuddhistEra();
  console.log(`==> Fetching headings for ${chapters.length} chapters from ${PORTAL} (${date})`);

  const cookie = await openSession();
  const byCode = new Map();
  const emptyChapters = [];

  for (const [index, chapter] of chapters.entries()) {
    if (index > 0) await new Promise((r) => setTimeout(r, delayMs));
    const rows = parseRows(await searchChapter(cookie, chapter, date)).filter(
      (r) => r.raw_code.startsWith(chapter),
    );
    if (rows.length === 0) emptyChapters.push(chapter);
    for (const row of rows) {
      if (byCode.has(row.raw_code)) continue;
      byCode.set(row.raw_code, {
        hs_code: dotted(row.raw_code),
        raw_code: row.raw_code,
        level: row.level,
        chapter,
        heading: dotted(row.raw_code.slice(0, 4)),
        description_th: row.description_th,
        description_en: row.description_en,
      });
    }
    console.log(`   ${chapter}: ${rows.length} rows`);
  }

  if (byCode.size === 0) {
    console.error("\n==> No heading rows parsed. The portal page layout may have changed.");
    process.exit(2);
  }

  const list = [...byCode.values()].sort((a, b) => a.raw_code.localeCompare(b.raw_code));
  fs.mkdirSync(outputDir, { recursive: true });
  writeJsonFiles(outputDir, { "hs_headings_list.json": list });

  const count = (level) => list.filter((r) => r.level === level).length;
  console.log(`\n======================================================`);
  console.log(`==> HS headings written to: ${outputDir}`);
  console.log(`   hs_headings_list.json  (${count("heading")} headings, ${count("subheading")} subheadings)`);
  if (emptyChapters.length) console.log(`   Chapters with no rows: ${emptyChapters.join(", ")}`);
  console.log(`======================================================`);
}

main().catch((err) => {
  console.error(`==> Heading fetch failed: ${err.message}`);
  process.exit(2);
});
