#!/usr/bin/env node

// Checks lib/conditions.js against the live portal: for each sample HS code,
// fetch every rate itd.customs.go.th shows and compare which privilege codes
// carry the red `**` with PORTAL_CONDITION_CODES.
//
//   node src/check_portal_conditions.js [-c 08012100,16010010] [--delay 1000]
//
// Exit codes: 0 = matches, 1 = mismatch (update lib/conditions.js, then
// `npm run build`), 2 = portal unreachable or its page layout changed.

const { PORTAL_CONDITION_CODES } = require("./lib/conditions");

const PORTAL = "http://itd.customs.go.th/igtf/viewerImportTariff.do";

// One tariff line per chapter group, each listed under 20+ privilege codes.
const DEFAULT_HS_CODES = [
  "01012100",
  "08012100",
  "16010010",
  "27101971",
  "39171010",
  "84713020",
];

function parseCliArgs(argv) {
  const opts = { hsCodes: DEFAULT_HS_CODES, delayMs: 1000 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "-h" || argv[i] === "--help") {
      console.log(
        "Usage: node src/check_portal_conditions.js [-c <hs,hs,...>] [--delay <ms>]",
      );
      process.exit(0);
    } else if (argv[i] === "-c" || argv[i] === "--codes") {
      opts.hsCodes = argv[++i].split(",").map((c) => c.replace(/\D/g, ""));
    } else if (argv[i] === "--delay") {
      opts.delayMs = parseInt(argv[++i], 10);
    }
  }
  const bad = opts.hsCodes.filter((c) => !/^\d{8}$/.test(c));
  if (bad.length) {
    console.error(`Error: HS codes must have 8 digits, got: ${bad.join(", ")}`);
    process.exit(2);
  }
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

async function fetchAllRates(cookie, hsCode, date) {
  const res = await fetch(PORTAL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(cookie && { Cookie: cookie }),
    },
    body: new URLSearchParams({
      param: "display1",
      key2: hsCode,
      lang: "t",
      docBegnDate: date,
    }),
  });
  if (!res.ok) throw new Error(`HS ${hsCode}: portal returned HTTP ${res.status}`);
  return res.text();
}

// Privilege code -> whether its table shows `**`. Each scheme table starts
// with a heading like "332 : ๓ (๓๑) ..." or "ATG : อาเซียน"; commented-out
// markup on the page also contains `**`, so comments are dropped first.
function parseMarkedSchemes(html) {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
  const parts = text.split(/(?<![\w.])([0-9A-Z]{3}) : /);
  const schemes = new Map();
  for (let i = 1; i < parts.length; i += 2) {
    schemes.set(parts[i], parts[i + 1].includes("**"));
  }
  return schemes;
}

async function main() {
  const { hsCodes, delayMs } = parseCliArgs(process.argv.slice(2));
  const date = todayBuddhistEra();
  const expected = [...PORTAL_CONDITION_CODES].sort();
  console.log(`==> Expected ** codes: ${expected.join(", ")}`);
  console.log(`==> Checking ${hsCodes.length} HS code(s) on ${PORTAL} (${date})`);

  const cookie = await openSession();
  const problems = [];
  let checked = 0;

  for (const [index, hsCode] of hsCodes.entries()) {
    if (index > 0) await new Promise((r) => setTimeout(r, delayMs));
    const schemes = parseMarkedSchemes(await fetchAllRates(cookie, hsCode, date));
    if (schemes.size === 0) {
      console.log(`   ${hsCode}: no rate tables found, skipped`);
      continue;
    }
    checked++;

    const marked = [...schemes].filter(([, m]) => m).map(([c]) => c);
    const unexpected = marked.filter((c) => !PORTAL_CONDITION_CODES.has(c));
    const missing = [...schemes]
      .filter(([c, m]) => PORTAL_CONDITION_CODES.has(c) && !m)
      .map(([c]) => c);

    const ok = !unexpected.length && !missing.length;
    console.log(
      `   ${hsCode}: ${schemes.size} codes, ** on [${marked.sort().join(", ")}] ${ok ? "OK" : "MISMATCH"}`,
    );
    if (unexpected.length)
      problems.push(`${hsCode}: portal shows ** on ${unexpected.join(", ")}, not in lib/conditions.js`);
    if (missing.length)
      problems.push(`${hsCode}: lib/conditions.js lists ${missing.join(", ")}, portal shows no **`);
  }

  if (checked === 0) {
    console.error("\n==> No rate tables parsed. The portal page layout may have changed.");
    process.exit(2);
  }
  if (problems.length) {
    console.error(`\n==> MISMATCH\n${problems.map((p) => `   - ${p}`).join("\n")}`);
    console.error("   Update lib/conditions.js, then run `npm run build` and re-seed.");
    process.exit(1);
  }
  console.log(`\n==> OK: ${checked} HS code(s) match lib/conditions.js`);
}

main().catch((err) => {
  console.error(`==> Portal check failed: ${err.message}`);
  process.exit(2);
});
