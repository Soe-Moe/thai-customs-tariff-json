# thai-customs-tariff-json

[![GitHub stars](https://img.shields.io/github/stars/Soe-Moe/thai-customs-tariff-json?style=social)](https://github.com/Soe-Moe/thai-customs-tariff-json/stargazers)
![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![License](https://img.shields.io/badge/license-ISC-blue)
![Data](https://img.shields.io/badge/data-Thai%20Customs%20ITD-orange)
![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)

Turn the Thai Customs Department's tariff master files into clean, bilingual (Thai / English) JSON that you can search by HS code.

The original files come as TIS-620 encoded fixed-width text, and one file mixes every privilege code together. The scripts here decode the files, separate the records by duty regime, parse rates, dates and conditions, and write two JSON views for each regime: a flat list, and a map keyed by HS code.

## Table of contents

- [What it's for](#what-its-for)
- [Datasets produced](#datasets-produced)
- [Quick start](#quick-start)
- [How to use it](#how-to-use-it)
- [Output format](#output-format)
- [Using the data](#using-the-data)
- [Glossary](#glossary)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Data source](#data-source)
- [Star this repo](#-star-this-repo)
- [Contributing](#contributing)
- [License](#license)

## What it's for

If you're building a tariff lookup, a landed-cost calculator, a customs declaration tool, or doing trade research on Thailand, you need answers to questions like:

- What's the WTO (MFN) duty rate for HS code `10011100`?
- Is there an FTA rate (ATIGA, RCEP, JTEPA, …) for this product, and what are its conditions?
- Is this product exempt from duty under Section 12 or an Emergency Decree?
- Does this product need an electronic import permit, and which agency issues it?

These scripts produce ready-to-use JSON that answers those questions, without anyone having to parse the raw customs files by hand.

### Features

- 🇹🇭 🇬🇧 Every label, description and date comes in both Thai and English
- 📅 Dates come in three formats: ISO (`2022-01-01`), Thai Buddhist Era (`01/01/2565`) and Gregorian (`01/01/2022`)
- 🔎 Records are keyed by 8-digit HS code, so a lookup is one step
- 🧾 Rates are parsed into numbers (ad valorem %, specific rate in baht per unit), plus exemption and condition flags
- 📦 The raw ITD data is included, gzipped: 323 MB of text shrinks to about 6 MB, so there's nothing extra to download
- 🪶 The only dependency is [`iconv-lite`](https://www.npmjs.com/package/iconv-lite), for TIS-620 decoding

## Datasets produced

| Script                             | Output                                 | Contents                                                                                                              |
| ---------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `build_wto_rates.js`               | `output/wto_json/`                     | WTO (MFN) duty rates                                                                                                  |
| `build_asean_atiga_rates.js`       | `output/asean_json/`                   | ASEAN ATIGA rates (`ATG` / `ASC`)                                                                                     |
| `build_fta_full_data.js`           | `output/fta_json/`                     | All FTA rates, grouped into multilateral and bilateral, including JTEPA codes `J1E`–`J3P`                             |
| `extract_fta_privilege_codes.js`   | `output/fta_privilege_dictionary.json` | Dictionary of FTA privilege codes, classified as multilateral or bilateral                                            |
| `build_section12_rates.js`         | `output/section12_json/`               | Section 12 duty exemptions                                                                                            |
| `build_section12_clause2_rates.js` | `output/section12_clause2_json/`       | Section 12, Clause 2 conditional rates (e.g. Free Zone)                                                               |
| `build_section12_clause3_rates.js` | `output/section12_clause3_json/`       | Section 12, Clause 3 conditional rates                                                                                |
| `build_emergency_decree_rates.js`  | `output/emergency_decree_json/`        | Emergency Decree ceiling rates (privilege code `999`)                                                                 |
| `build_electronic_permits.js`      | `output/permit_json/`                  | Import permit requirements and issuing agencies (DOA, FDA, DLD, DOF, DFT, DIW, TISI, …)                               |
| `build_hs_chapters.js`             | `output/hs_chapters_json/`             | HS chapters (01–97) and sections (I–XXI) with Thai / English titles                                                   |
| `build_hs_catalog.js`              | `output/hs_catalog_json/`              | HS catalog of all 8-digit tariff lines with Thai / English descriptions and general duty rates (privilege code `000`) |

## Quick start

```bash
git clone https://github.com/Soe-Moe/thai-customs-tariff-json.git
cd thai-customs-tariff-json
npm install
npm run build
```

The generated JSON is written to `./output`.

## How to use it

### Requirements

- [Node.js](https://nodejs.org/) 18 or newer

### 1. Raw data

The raw ITD master files are already in `src/raw-data/`, compressed with gzip. The scripts read `.txt.gz` files directly, so you don't need to unzip anything:

```text
src/raw-data/
├── REFDRT_Open_20220101.txt.gz   # Duty rates (all privilege codes)
├── REFTRC_Open.txt.gz            # Tariff codes & goods descriptions
├── REFPRV_Open.txt.gz            # Privilege code master
├── REFPMG_Open.txt.gz            # Electronic import permits
└── patches/                      # Extra privilege files, e.g. REFPVC_Open_J1E.txt
```

| File                          | Used by                                           |
| ----------------------------- | ------------------------------------------------- |
| `REFDRT_Open_20220101.txt.gz` | All rate scripts                                  |
| `REFTRC_Open.txt.gz`          | All rate scripts                                  |
| `REFPRV_Open.txt.gz`          | FTA, ASEAN, Section 12 Clause 2/3, FTA dictionary |
| `REFPMG_Open.txt.gz`          | Electronic permits                                |
| `patches/`                    | FTA, FTA dictionary                               |

Each script looks for `<name>.txt` first and falls back to `<name>.txt.gz`. So you can also drop in uncompressed `.txt` files, e.g. a fresh download from ITD (see [Updating the raw data](#updating-the-raw-data)).

### 2. Build everything

```bash
npm run build
```

### 3. Or build one dataset at a time

| npm script                        | Runs                               |
| --------------------------------- | ---------------------------------- |
| `npm run build:fta-dictionary`    | `extract_fta_privilege_codes.js`   |
| `npm run build:fta`               | `build_fta_full_data.js`           |
| `npm run build:wto`               | `build_wto_rates.js`               |
| `npm run build:asean`             | `build_asean_atiga_rates.js`       |
| `npm run build:section12`         | `build_section12_rates.js`         |
| `npm run build:section12-clause2` | `build_section12_clause2_rates.js` |
| `npm run build:section12-clause3` | `build_section12_clause3_rates.js` |
| `npm run build:emergency-decree`  | `build_emergency_decree_rates.js`  |
| `npm run build:permits`           | `build_electronic_permits.js`      |
| `npm run build:hs-chapters`       | `build_hs_chapters.js`             |
| `npm run build:hs-catalog`        | `build_hs_catalog.js`              |

You can also call a script directly with your own paths:

```bash
node src/build_wto_rates.js -b ./src/raw-data -o ./output/wto_json
node src/build_electronic_permits.js -i ./src/raw-data/REFPMG_Open.txt -o ./output/permit_json
```

### CLI options

| Flag                 | Description                                                                                                                                                   | Default                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `-b`, `--base-dir`   | Folder containing the raw data files                                                                                                                          | `./src/raw-data`                 |
| `-o`, `--output-dir` | Folder to write JSON to (`--output` file path for `extract_fta_privilege_codes.js`)                                                                           | varies per script                |
| `-i`, `--input`      | Input permit file, `.txt` or `.txt.gz` (`build_electronic_permits.js` only)                                                                                   | `./src/raw-data/REFPMG_Open.txt` |
| `-h`, `--help`       | Show usage (`build_asean_atiga_rates.js`, `build_emergency_decree_rates.js`, `extract_fta_privilege_codes.js`, `build_hs_chapters.js`, `build_hs_catalog.js`) |                                  |

> **Note:** The generated JSON is large (the full FTA output is over 170 MB), which is over GitHub's 100 MB file limit. `output/` is in `.gitignore`, so generate it locally with `npm run build`.

### Updating the raw data

When Thai Customs publishes new files on [ITD](http://itd.customs.go.th/):

```bash
# 1. Put the new .txt files in src/raw-data/, then compress them
gzip -9 -n -f src/raw-data/*.txt

# 2. Rebuild the JSON
npm run build
```

Commit only the `.txt.gz` files. Uncompressed `src/raw-data/*.txt` files are in `.gitignore`, because `REFDRT_Open_20220101.txt` alone is 171 MB.

## Output format

Most scripts write two files:

| File               | Shape                                    | Use it for                                 |
| ------------------ | ---------------------------------------- | ------------------------------------------ |
| `*_full_list.json` | Flat array of records, sorted by HS code | Importing into a database, bulk processing |
| `*_by_hscode.json` | Object: `{ "<hs_code>": [records…] }`    | Fast lookup by HS code                     |

The FTA script writes `fta_multilateral_full.json`, `fta_bilateral_full.json` and `fta_by_hscode_grouped.json` (with `metadata`, `multilateral` and `bilateral` keys). The permit script writes `electronic_permits_flat.json` and `electronic_permits_by_hscode.json`.

### HS chapters & sections (`hs_chapters_json/`)

| File                       | Shape                                                               | Use it for                                                   |
| -------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------ |
| `hs_chapters_list.json`    | Array of 96 chapters (chapter 77 is reserved in the HS and skipped) | Listing all chapters                                         |
| `hs_chapters_by_code.json` | Object keyed by 2-digit chapter, e.g. `chapters["08"]`              | Looking up a chapter from the first two digits of an HS code |
| `hs_sections_grouped.json` | Array of sections I–XXI, each with its `chapters`                   | Tree views and grouped dropdowns                             |

```json
{
  "chapter": "01",
  "chapter_number": 1,
  "title_th": "สัตว์มีชีวิต",
  "title_en": "Live animals",
  "section_id": "I",
  "section_order": 1,
  "section_title_th": "หมวด 1 สัตว์มีชีวิตและผลิตภัณฑ์จากสัตว์",
  "section_title_en": "Section I Live Animals; Animal Products"
}
```

### HS catalog (`hs_catalog_json/`)

| File                         | Shape                                                        | Use it for                                 |
| ---------------------------- | ------------------------------------------------------------ | ------------------------------------------ |
| `hs_catalog_full_list.json`  | Flat array of tariff lines, sorted by HS code                | Importing into a database, bulk processing |
| `hs_catalog_by_chapter.json` | Object keyed by 2-digit chapter: `{ "<chapter>": [items…] }` | Loading one chapter at a time              |

Each item has `hs_code` (e.g. `0305.71.10`), `raw_code`, `chapter`, `heading`, `subheading`, `indent`, `description_th` / `description_en`, `effective_date` / `expiry_date`, and the general duty rate from privilege code `000` (`duty_exempt`, `ad_valorem_percent`, `specific_rate_baht`, `specific_unit_th` / `specific_unit_en`). Tariff lines with no `000` rate in REFDRT have `null` rates.

The raw files have no dash indents, so `indent` (0–4) is worked out from the HS code, and the descriptions are prefixed with that many dashes, as in the printed tariff schedule (e.g. `0801.21.00` → `- - ทั้งเปลือก` / `- - In shell`). Levels deeper than the code shows can't be detected.

Some tariff lines have more than one `000` rate, split by product. These items also have a `duty_rate_variants` array, and each variant has a `note_th` naming the products it covers (e.g. `เฉพาะรากชะเอม`, "licorice root only"). The top-level rate is the last variant, usually the catch-all `อื่นๆ` ("other") rate.

### Sample rate record (`wto_by_hscode.json`)

```json
{
  "10011100": [
    {
      "heading": "10.01",
      "tariff_code": "1001.110000",
      "raw_hs_code": "10011100",
      "tariff_seq": "65017",
      "privilege_code": "WTO",
      "agreement_name": {
        "th": "WTO : องค์การการค้าโลก",
        "en": "WTO : World Trade Organization"
      },
      "description": {
        "th": "- - รายการตามพิกัด",
        "en": "- - Tariff Item Description"
      },
      "duty_rate": {
        "ad_valorem_percentage": 27,
        "specific_rate_baht": 0,
        "specific_unit": { "th": "-", "en": "-" },
        "is_exempt": false,
        "has_condition": false,
        "display_th": "27.000",
        "display_en": "27.000%"
      },
      "effective_date": {
        "iso": "2022-01-01",
        "th": "01/01/2565",
        "en": "01/01/2022"
      },
      "expiry_date": {
        "iso": null,
        "th": "เป็นต้นไป",
        "en": "Indefinite / Ongoing"
      }
    }
  ]
}
```

### Rate record fields

| Field                                 | Description                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `heading`                             | 4-digit HS heading, e.g. `10.01`                                                                                  |
| `tariff_code`                         | Tariff code as printed in the Thai tariff schedule                                                                |
| `raw_hs_code` / `hs_code`             | 8-digit HS code with no dots, the lookup key                                                                      |
| `tariff_seq`                          | Sequence number of the tariff version the record comes from                                                       |
| `privilege_code`                      | Duty regime code, e.g. `WTO`, `ATG`, `J1E`, `999` (see [Glossary](#glossary))                                     |
| `agreement_name`                      | Name of the agreement or privilege (`th` / `en`)                                                                  |
| `description`                         | Goods description (`th` / `en`)                                                                                   |
| `duty_rate.ad_valorem_percentage`     | Ad valorem rate in % (FTA records use `duty_rate.percentage`)                                                     |
| `duty_rate.specific_rate_baht`        | Specific rate in baht per unit, if any                                                                            |
| `duty_rate.specific_unit`             | Unit for the specific rate, e.g. Kilogram, Litre                                                                  |
| `duty_rate.is_exempt`                 | `true` if duty is exempted (0%)                                                                                   |
| `duty_rate.has_condition`             | `true` if the rate has conditions (quota, annex list, verification). FTA records use `restrictions.has_condition` |
| `duty_rate.display_th` / `display_en` | Human-readable rate text                                                                                          |
| `legal_notification`                  | Legal basis, e.g. `Sec.12 Notif.01 (2022)`, `JTEPA (2025)`                                                        |
| `effective_date` / `expiry_date`      | `{ iso, th, en }`. `iso: null` means no end date                                                                  |

### Permit record fields

| Field                            | Description                                 |
| -------------------------------- | ------------------------------------------- |
| `hs_code` / `raw_hs_code`        | HS code, with and without dots              |
| `stat_code`                      | Statistical suffix code                     |
| `issuing_agency`                 | Agency that issues the permit (`th` / `en`) |
| `regulation_case`                | Import or export (`th` / `en`)              |
| `condition`                      | Whether a permit is required (`th` / `en`)  |
| `effective_date` / `expiry_date` | `{ iso, th, en }`                           |

## Using the data

### Node.js: look up every rate for one HS code

```js
const fs = require("fs");

const load = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const wto = load("./output/wto_json/wto_by_hscode.json");
const fta = load("./output/fta_json/fta_by_hscode_grouped.json");
const permits = load("./output/permit_json/electronic_permits_by_hscode.json");

const hs = "10011100";

console.log(
  "WTO:",
  wto[hs]?.map((r) => r.duty_rate.display_en),
);
console.log(
  "FTA:",
  [...(fta.multilateral[hs] ?? []), ...(fta.bilateral[hs] ?? [])].map(
    (r) => `${r.privilege_code}: ${r.duty_rate.display_en}`,
  ),
);
console.log(
  "Permits:",
  permits[hs]?.map((p) => p.issuing_agency.en),
);
```

### Command line with `jq`

```bash
# WTO rate for one HS code
jq '."10011100"[0].duty_rate' output/wto_json/wto_by_hscode.json

# All duty-exempt Section 12 records
jq '[.[] | select(.duty_rate.is_exempt)] | length' output/section12_json/section12_full_list.json
```

> The largest files are 100+ MB. For a production API, load them into a database (SQLite, PostgreSQL, MongoDB, …) instead of reading the JSON on every request.

## Glossary

| Term                       | Meaning                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **HS code**                | Harmonized System code. The international product classification used for tariffs                                 |
| **Privilege code**         | Thai Customs code for the duty regime a rate belongs to                                                           |
| **WTO / MFN**              | Most-Favoured-Nation rate under Thailand's WTO commitments (Section 14)                                           |
| **ATG / ASC**              | ASEAN Trade in Goods Agreement (ATIGA) rates                                                                      |
| **Multilateral FTA**       | Regional agreements, e.g. RCEP (`R1C`, `R1D` …) and ASEAN+1 (`AAN`, `ACN`, `AHK`, `AIN`, `AJ*`, `AK*`)            |
| **Bilateral FTA**          | Thailand-to-one-country agreements, e.g. JTEPA with Japan (`J1E`, `J1P` …), TAFTA with Australia                  |
| **Section 12**             | Duty exemptions and reductions under Section 12 of the Customs Tariff Decree (พ.ร.ก. พิกัดอัตราศุลกากร พ.ศ. 2530) |
| **Emergency Decree (999)** | Maximum ceiling rates under Part 2 of the 1987 Customs Tariff Decree                                              |
| **Buddhist Era (B.E.)**    | Thai calendar year = Gregorian year + 543 (e.g. 2565 = 2022)                                                      |

## Project structure

```text
thai-customs-tariff-json/
├── src/                                 # Parser scripts (one per dataset) and raw data
│   ├── lib/raw_file.js                  # Reads .txt / .txt.gz raw files and decodes TIS-620
│   ├── build_wto_rates.js
│   ├── build_asean_atiga_rates.js
│   ├── build_fta_full_data.js
│   ├── extract_fta_privilege_codes.js
│   ├── build_section12_rates.js
│   ├── build_section12_clause2_rates.js
│   ├── build_section12_clause3_rates.js
│   ├── build_emergency_decree_rates.js
│   ├── build_electronic_permits.js
│   ├── build_hs_chapters.js
│   ├── build_hs_catalog.js
│   └── raw-data/                        # Raw ITD files (gzipped)
├── output/                              # Generated JSON (not committed, run `npm run build`)
├── .gitignore
├── LICENSE
├── package.json
└── README.md
```

## Troubleshooting

| Problem                                                   | Fix                                                                                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `Error: Required files are missing in <folder>`           | Check that the file names in `src/raw-data/` match exactly, e.g. `REFDRT_Open_20220101.txt.gz` or `REFDRT_Open_20220101.txt` |
| Thai text shows as `�` or garbled characters              | The raw files must be the original TIS-620 files. Don't re-save them as UTF-8 before compressing or parsing                  |
| `JavaScript heap out of memory`                           | Give Node more memory: `node --max-old-space-size=8192 src/build_fta_full_data.js`                                           |
| `Patches folder not found`                                | Only a notice. The FTA scripts still run using `REFPRV_Open.txt` alone                                                       |
| A newer ITD release has a different date in the file name | Rename it to `REFDRT_Open_20220101.txt` (then gzip it), or update `dutyFile` in the scripts                                  |

## Data source

All data comes from the **Thai Customs Department** Integrated Tariff Database (ITD):

**🔗 [http://itd.customs.go.th/](http://itd.customs.go.th/)**

Full credit for the source data belongs to the Customs Department of Thailand (กรมศุลกากร). This project only reformats that data. It isn't affiliated with or endorsed by the Thai Customs Department.

Customs rates change often. To refresh the data, see [Updating the raw data](#updating-the-raw-data).

> **Disclaimer:** The output is provided for convenience only and may contain parsing errors or be out of date. For official duty rates and legal requirements, always check the latest data on the Thai Customs website or consult a licensed customs broker.

## ⭐ Star this repo

If this project saved you time, please [**give it a star**](https://github.com/Soe-Moe/thai-customs-tariff-json/stargazers)! It helps other people find it and keeps the project going.

## Contributing

Contributions are welcome. Ways to help:

- 🐛 **Report bugs:** [open an issue](https://github.com/Soe-Moe/thai-customs-tariff-json/issues) with the HS code, the script you ran, and the wrong output you saw
- 🛠️ **Fix parsing issues:** fixed-width customs files have many edge cases, so any fix helps
- 📦 **Add datasets:** support more privilege codes or other ITD files
- 📝 **Improve docs:** clearer explanations, field references and examples

To contribute code:

1. Fork the repository
2. Create a branch: `git checkout -b feature/my-improvement`
3. Make your change and run the affected `npm run build:*` script to check the output
4. Commit your changes: `git commit -m "Add my improvement"`
5. Push the branch: `git push origin feature/my-improvement`
6. Open a Pull Request that describes what changed and, where possible, shows a before/after record

Guidelines:

- Keep code comments and log messages in English
- Keep output fields bilingual (`th` / `en`)
- Commit raw data only as `.txt.gz`, and don't commit files from `output/`

## License

The code in this repository is released under the [ISC License](LICENSE).

The source data belongs to the Thai Customs Department. Check the terms of use on [itd.customs.go.th](http://itd.customs.go.th/) before you redistribute the raw or generated data.
