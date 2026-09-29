#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { rawFileExists, readRawText } = require("./lib/raw_file");

// Parse CLI arguments
const args = process.argv.slice(2);
let baseDir = "./raw-data";
let outputDir = "./data/classification";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "-b" || args[i] === "--base-dir") baseDir = args[++i];
  else if (args[i] === "-o" || args[i] === "--output-dir")
    outputDir = args[++i];
  else if (args[i] === "-h" || args[i] === "--help") {
    console.log(`
Usage:
  node build_hs_chapters.js [-b <raw-data-folder>] [-o <output-folder>]

Default:
  -b ./raw-data
  -o ./data/classification
    `);
    process.exit(0);
  }
}

const resolvedBaseDir = path.resolve(process.cwd(), baseDir);
const resolvedOutputDir = path.resolve(process.cwd(), outputDir);
const tariffFile = path.join(resolvedBaseDir, "REFTRC_Open.txt");

if (!fs.existsSync(resolvedOutputDir)) {
  fs.mkdirSync(resolvedOutputDir, { recursive: true });
}

// ==========================================
// 1. Official WCO / Thai Customs Sections Master (I - XXI)
// ==========================================
const SECTIONS_MASTER = [
  {
    section_id: "I",
    section_order: 1,
    chapters: [1, 2, 3, 4, 5],
    section_title_th: "หมวด 1 สัตว์มีชีวิตและผลิตภัณฑ์จากสัตว์",
    section_title_en: "Section I Live Animals; Animal Products",
  },
  {
    section_id: "II",
    section_order: 2,
    chapters: [6, 7, 8, 9, 10, 11, 12, 13, 14],
    section_title_th: "หมวด 2 ผลิตภัณฑ์จากพืช",
    section_title_en: "Section II Vegetable Products",
  },
  {
    section_id: "III",
    section_order: 3,
    chapters: [15],
    section_title_th:
      "หมวด 3 ไขมันและน้ำมันที่ได้จากสัตว์หรือพืช หรือผลิตภัณฑ์ที่แยกได้จากไขมันและน้ำมันดังกล่าว ไขมันที่แต่งขึ้นสำหรับบริโภค ไขหรือขี้ผึ้งที่ได้จากสัตว์หรือพืช",
    section_title_en:
      "Section III Animal, Vegetable or Microbial Fats and Oils and Their Cleavage Products; Prepared Edible Fats; Animal or Vegetable Waxes",
  },
  {
    section_id: "IV",
    section_order: 4,
    chapters: [16, 17, 18, 19, 20, 21, 22, 23, 24],
    section_title_th:
      "หมวด 4 อาหารปรุงแต่ง เครื่องดื่ม เครื่องดื่มที่มีแอลกอฮอล์ น้ำส้มสายชู ยาสูบและผลิตภัณฑ์ที่ใช้แทนยาสูบ ผลิตภัณฑ์ที่มีหรือไม่มีนิโคตินที่ใช้สำหรับสูดดมโดยไม่ผ่านการเผาไหม้ ผลิตภัณฑ์อื่นที่มีนิโคตินสำหรับนำนิโคตินเข้าสู่ร่างกาย",
    section_title_en:
      "Section IV Prepared Foodstuffs; Beverages, Spirits and Vinegar; Tobacco and Manufactured Tobacco Substitutes; Products, Whether or Not Containing Nicotine, Intended for Inhalation Without Combustion; Other Nicotine Containing Products",
  },
  {
    section_id: "V",
    section_order: 5,
    chapters: [25, 26, 27],
    section_title_th: "หมวด 5 ผลิตภัณฑ์แร่",
    section_title_en: "Section V Mineral Products",
  },
  {
    section_id: "VI",
    section_order: 6,
    chapters: [28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38],
    section_title_th:
      "หมวด 6 ผลิตภัณฑ์ของอุตสาหกรรมเคมีหรืออุตสาหกรรมที่เกี่ยวข้องกัน",
    section_title_en:
      "Section VI Products of the Chemical or Allied Industries",
  },
  {
    section_id: "VII",
    section_order: 7,
    chapters: [39, 40],
    section_title_th:
      "หมวด 7 พลาสติกและของที่ทำด้วยพลาสติก ยางและของที่ทำด้วยยาง",
    section_title_en:
      "Section VII Plastics and Articles Thereof; Rubber and Articles Thereof",
  },
  {
    section_id: "VIII",
    section_order: 8,
    chapters: [41, 42, 43],
    section_title_th:
      "หมวด 8 หนังดิบ หนังฟอก หนังเฟอร์และของที่ทำด้วยหนังดังกล่าว อานม้าและเครื่องเทียมลาก เครื่องใช้สำหรับเดินทาง กระเป๋าถือและภาชนะที่คล้ายกัน ของที่ทำด้วยลำไส้ของสัตว์ (นอกจากลำไส้ไหม)",
    section_title_en:
      "Section VIII Raw Hides and Skins, Leather, Furskins and Articles Thereof; Saddlery and Harness; Travel Goods, Handbags and Similar Containers; Articles of Animal Gut",
  },
  {
    section_id: "IX",
    section_order: 9,
    chapters: [44, 45, 46],
    section_title_th:
      "หมวด 9 ไม้และของที่ทำด้วยไม้ ถ่านไม้ ไม้ก๊อกและของที่ทำด้วยไม้ก๊อก ของที่ทำด้วยฟาง เอสพาร์โต หรือวัตถุจักสานอื่นๆ เครื่องจักสานและเครื่องสาน",
    section_title_en:
      "Section IX Wood and Articles of Wood; Wood Charcoal; Cork and Articles of Cork; Manufactures of Straw, of Esparto or of Other Plaiting Materials; Basketware and Wickerwork",
  },
  {
    section_id: "X",
    section_order: 10,
    chapters: [47, 48, 49],
    section_title_th:
      "หมวด 10 เยื่อไม้หรือเยื่อที่ได้จากวัตถุจำพวกเส้นใยเซลลูโลสอื่นๆ กระดาษหรือกระดาษแข็งที่นำกลับมารีไซเคิล (เศษและของที่ใช้ไม่ได้) กระดาษและกระดาษแข็ง รวมทั้งของที่ทำด้วยกระดาษหรือกระดาษแข็ง",
    section_title_en:
      "Section X Pulp of Wood or of Other Fibrous Cellulosic Material; Recovered (Waste and Scrap) Paper or Paperboard; Paper and Paperboard and Articles Thereof",
  },
  {
    section_id: "XI",
    section_order: 11,
    chapters: [50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63],
    section_title_th: "หมวด 11 สิ่งทอและของทำด้วยสิ่งทอ",
    section_title_en: "Section XI Textiles and Textile Articles",
  },
  {
    section_id: "XII",
    section_order: 12,
    chapters: [64, 65, 66, 67],
    section_title_th:
      "หมวด 12 รองเท้า เครื่องสวมศีรษะ ร่ม ร่มบังแดด ไม้เท้า ไม้เท้าที่นั่ง แส้ ม้าขี่ และส่วนประกอบของของดังกล่าว ขนนกและขนดาวน์ที่จัดทำแล้ว และของที่ทำด้วยขนนกหรือขนดาวน์ ดอกไม้เทียม ของที่ทำด้วยเส้นผม",
    section_title_en:
      "Section XII Footwear, Headgear, Umbrellas, Sun Umbrellas, Walking-Sticks, Seat-Sticks, Whips, Riding-Crops and Parts Thereof; Prepared Feathers and Articles Made Therewith; Artificial Flowers; Articles of Human Hair",
  },
  {
    section_id: "XIII",
    section_order: 13,
    chapters: [68, 69, 70],
    section_title_th:
      "หมวด 13 ของที่ทำด้วยหิน พลาสเตอร์ ซีเมนต์ แอสเบสตอส ไมกา หรือวัตถุที่คล้ายกัน ผลิตภัณฑ์เซรามิก แก้วและเครื่องแก้ว",
    section_title_en:
      "Section XIII Articles of Stone, Plaster, Cement, Asbestos, Mica or Similar Materials; Ceramic Products; Glass and Glassware",
  },
  {
    section_id: "XIV",
    section_order: 14,
    chapters: [71],
    section_title_th:
      "หมวด 14 ไข่มุกธรรมชาติหรือไข่มุกเลี้ยง รัตนชาติหรือกึ่งรัตนชาติ โลหะมีค่า โลหะที่หุ้มปรับด้วยโลหะมีค่า และของที่ทำด้วยของดังกล่าว เครื่องเพชรพลอยรูปพรรณแท้ เหรียญกษาปณ์",
    section_title_en:
      "Section XIV Natural or Cultured Pearls, Precious or Semi-Precious Stones, Precious Metals, Metals Clad with Precious Metal, and Articles Thereof; Imitation Jewellery; Coin",
  },
  {
    section_id: "XV",
    section_order: 15,
    chapters: [72, 73, 74, 75, 76, 78, 79, 80, 81, 82, 83],
    section_title_th: "หมวด 15 โลหะสามัญและของที่ทำด้วยโลหะสามัญ",
    section_title_en: "Section XV Base Metals and Articles of Base Metal",
  },
  {
    section_id: "XVI",
    section_order: 16,
    chapters: [84, 85],
    section_title_th:
      "หมวด 16 เครื่องจักรและเครื่องจักรกล เครื่องอุปกรณ์ไฟฟ้า รวมทั้งส่วนประกอบของเครื่องดังกล่าว เครื่องบันทึกเสียงและเครื่องถอดเสียง เครื่องบันทึกและเครื่องถอดภาพและเสียงทางโทรทัศน์ รวมทั้งส่วนประกอบและอุปกรณ์ประกอบของเครื่องดังกล่าว",
    section_title_en:
      "Section XVI Machinery and Mechanical Appliances; Electrical Equipment; Parts Thereof; Sound Recorders and Reproducers, Television Image and Sound Recorders and Reproducers, and Parts and Accessories of Such Articles",
  },
  {
    section_id: "XVII",
    section_order: 17,
    chapters: [86, 87, 88, 89],
    section_title_th:
      "หมวด 17 ยานบก ยานอากาศ ยานน้ำ และอุปกรณ์การขนส่งที่เกี่ยวข้องกัน",
    section_title_en:
      "Section XVII Vehicles, Aircraft, Vessels and Associated Transport Equipment",
  },
  {
    section_id: "XVIII",
    section_order: 18,
    chapters: [90, 91, 92],
    section_title_th:
      "หมวด 18 เครื่องมือและเครื่องใช้ออปติค เครื่องถ่ายภาพ เครื่องถ่ายภาพยนตร์ เครื่องวัด เครื่องตรวจ เครื่องวัดความเที่ยง เครื่องมือและเครื่องใช้ในทางการแพทย์หรือศัลยกรรม นาฬิกาชนิดต่างๆ เครื่องดนตรี รวมทั้งส่วนประกอบและอุปกรณ์ประกอบของเครื่องดังกล่าว",
    section_title_en:
      "Section XVIII Optical, Photographic, Cinematographic, Measuring, Checking, Precision, Medical or Surgical Instruments and Apparatus; Clocks and Watches; Musical Instruments; Parts and Accessories Thereof",
  },
  {
    section_id: "XIX",
    section_order: 19,
    chapters: [93],
    section_title_th:
      "หมวด 19 อาวุธและกระสุน รวมทั้งส่วนประกอบและอุปกรณ์ประกอบของของดังกล่าว",
    section_title_en:
      "Section XIX Arms and Ammunition; Parts and Accessories Thereof",
  },
  {
    section_id: "XX",
    section_order: 20,
    chapters: [94, 95, 96],
    section_title_th: "หมวด 20 ผลิตภัณฑ์เบ็ดเตล็ด",
    section_title_en: "Section XX Miscellaneous Manufactured Articles",
  },
  {
    section_id: "XXI",
    section_order: 21,
    chapters: [97],
    section_title_th: "หมวด 21 ศิลปวัตถุ ของสะสมสำหรับผู้สะสม และโบราณวัตถุ",
    section_title_en:
      "Section XXI Works of Art, Collectors' Pieces and Antiques",
  },
];

// Helper: look up section info for a chapter number
function findSectionForChapter(chapterNum) {
  for (const sec of SECTIONS_MASTER) {
    if (sec.chapters.includes(chapterNum)) {
      return {
        section_id: sec.section_id,
        section_order: sec.section_order,
        section_title_th: sec.section_title_th,
        section_title_en: sec.section_title_en,
      };
    }
  }
  return {
    section_id: "OTHER",
    section_order: 99,
    section_title_th: "หมวดเบ็ดเตล็ด",
    section_title_en: "Other",
  };
}

// ==========================================
// 2. Standard HS Chapter Titles Dictionary (01 - 97)
// ==========================================
const CHAPTER_DICTIONARY = {
  "01": { th: "สัตว์มีชีวิต", en: "Live animals" },
  "02": {
    th: "เนื้อสัตว์และเครื่องในสัตว์ที่บริโภคได้",
    en: "Meat and edible meat offal",
  },
  "03": {
    th: "ปลา สัตว์น้ำจำพวกครัสตาเซีย โมลลุสก์ และสัตว์น้ำที่ไม่มีกระดูกสันหลังอื่นๆ",
    en: "Fish and crustaceans, molluscs and other aquatic invertebrates",
  },
  "04": {
    th: "ผลิตภัณฑ์นม ไข่สัตว์ปีก น้ำผึ้งธรรมชาติ ผลิตภัณฑ์จากสัตว์ที่บริโภคได้ซึ่งไม่ได้ระบุหรือรวมไว้ในที่อื่น",
    en: "Dairy produce; birds' eggs; natural honey; edible products of animal origin, not elsewhere specified or included",
  },
  "05": {
    th: "ผลิตภัณฑ์จากสัตว์ที่ไม่ได้ระบุหรือรวมไว้ในที่อื่น",
    en: "Products of animal origin, not elsewhere specified or included",
  },
  "06": {
    th: "ต้นไม้และพืชอื่นๆ ที่มีชีวิต หัว ราก และสิ่งอื่นที่คล้ายกัน ดอกไม้ตัดและใบไม้ประดับ",
    en: "Live trees and other plants; bulbs, roots and the like; cut flowers and ornamental foliage",
  },
  "07": {
    th: "พืชผัก รากและหัวบางชนิดที่บริโภคได้",
    en: "Edible vegetables and certain roots and tubers",
  },
  "08": {
    th: "ผลไม้และลูกนัตที่บริโภคได้ เปลือกผลไม้จำพวกส้มหรือเปลือกแตง",
    en: "Edible fruit and nuts; peel of citrus fruit or melons",
  },
  "09": {
    th: "กาแฟ ชา ชามาเต้ และเครื่องเทศ",
    en: "Coffee, tea, maté and spices",
  },
  10: { th: "ธัญพืช", en: "Cereals" },
  11: {
    th: "ผลิตภัณฑ์ของโรงสีข้าว มอลต์ สตาร์ช อินูลิน กลูเตนจากข้าวสาลี",
    en: "Products of the milling industry; malt; starches; inulin; wheat gluten",
  },
  12: {
    th: "เมล็ดพืชและผลไม้ที่มีน้ำมัน เมล็ดธัญพืช เมล็ดพืชและผลไม้เบ็ดเตล็ด พืชที่ใช้ในทางอุตสาหกรรมหรือทางยา ฟางและหญ้าอาหารสัตว์",
    en: "Oil seeds and oleaginous fruits; miscellaneous grains, seeds and fruit; industrial or medicinal plants; straw and fodder",
  },
  13: {
    th: "ครั่ง กัม เรซิน และน้ำมันยางจากพืช รวมทั้งสิ่งสกัดจากพืชอื่นๆ",
    en: "Lac; gums, resins and other vegetable saps and extracts",
  },
  14: {
    th: "วัตถุจากพืชใช้ในการถักจัก ผลิตภัณฑ์จากพืชที่ไม่ได้ระบุหรือรวมไว้ในที่อื่น",
    en: "Vegetable plaiting materials; vegetable products not elsewhere specified or included",
  },
  15: {
    th: "ไขมันและน้ำมันที่ได้จากสัตว์ พืช หรือจุลินทรีย์ และผลิตภัณฑ์ที่แยกได้จากไขมันและน้ำมันดังกล่าว ไขมันที่แต่งขึ้นสำหรับบริโภค ขี้ผึ้งหรือไขที่ได้จากสัตว์หรือพืช",
    en: "Animal, vegetable or microbial fats and oils and their cleavage products; prepared edible fats; animal or vegetable waxes",
  },
  16: {
    th: "ของปรุงแต่งจากเนื้อสัตว์ ปลา สัตว์น้ำจำพวกครัสตาเซีย โมลลุสก์ หรือสัตว์น้ำที่ไม่มีกระดูกสันหลังอื่นๆ หรือจากแมลง",
    en: "Preparations of meat, of fish, of crustaceans, molluscs or other aquatic invertebrates, or of insects",
  },
  17: { th: "น้ำตาลและขนมทำด้วยน้ำตาล", en: "Sugars and sugar confectionery" },
  18: {
    th: "โกโก้และของปรุงแต่งที่ทำด้วยโกโก้",
    en: "Cocoa and cocoa preparations",
  },
  19: {
    th: "ของปรุงแต่งจากธัญพืช แป้ง สตาร์ช หรือนม ผลิตภัณฑ์ขนมอบ",
    en: "Preparations of cereals, flour, starch or milk; pastrycooks' products",
  },
  20: {
    th: "ของปรุงแต่งจากพืชผัก ผลไม้ ลูกนัต หรือส่วนอื่นของพืช",
    en: "Preparations of vegetables, fruit, nuts or other parts of plants",
  },
  21: {
    th: "ของปรุงแต่งเบ็ดเตล็ดที่บริโภคได้",
    en: "Miscellaneous edible preparations",
  },
  22: {
    th: "เครื่องดื่ม เครื่องดื่มที่มีแอลกอฮอล์ และน้ำส้มสายชู",
    en: "Beverages, spirits and vinegar",
  },
  23: {
    th: "กากและเศษเหลือจากอุตสาหกรรมผลิตอาหาร อาหารสัตว์ที่ปรุงแต่งขึ้น",
    en: "Residues and waste from the food industries; prepared animal fodder",
  },
  24: {
    th: "ยาสูบและผลิตภัณฑ์ที่ใช้แทนยาสูบ ผลิตภัณฑ์ที่มีหรือไม่มีนิโคตินสำหรับสูดดมโดยไม่เผาไหม้",
    en: "Tobacco and manufactured tobacco substitutes; products, whether or not containing nicotine, intended for inhalation without combustion",
  },
  25: {
    th: "เกลือ กำมะถัน ดินและหิน วัตถุจำพวกปูนปลาสเตอร์ ปูนขาวและซีเมนต์",
    en: "Salt; sulphur; earths and stone; plastering materials, lime and cement",
  },
  26: { th: "สินแร่ สแลก และขี้เถ้า", en: "Ores, slag and ash" },
  27: {
    th: "เชื้อเพลิงแร่ น้ำมันแร่และผลิตภัณฑ์ที่ได้จากการกลั่นสิ่งดังกล่าว วัตถุบิทูมินัส ไขจากแร่",
    en: "Mineral fuels, mineral oils and products of their distillation; bituminous substances; mineral waxes",
  },
  28: {
    th: "เคมีภัณฑ์อนินทรีย์ สารประกอบอินทรีย์หรืออนินทรีย์ของโลหะมีค่า ของโลหะธาตุหายาก ของธาตุกัมมันตรังสี หรือของไอโซโทป",
    en: "Inorganic chemicals; organic or inorganic compounds of precious metals, of rare-earth metals, of radioactive elements or of isotopes",
  },
  29: { th: "เคมีภัณฑ์อินทรีย์", en: "Organic chemicals" },
  30: { th: "เภสัชภัณฑ์", en: "Pharmaceutical products" },
  31: { th: "ปุ๋ย", en: "Fertilisers" },
  32: {
    th: "สิ่งสกัดที่ใช้ฟอกหนังหรือย้อมสี แทนนินและสารอนุพันธ์ สารสี สิ่งสี สีทาและวาร์นิช พัตตีและมาสติกอื่นๆ หมึก",
    en: "Tanning or dyeing extracts; tannins and their derivatives; dyes, pigments and other colouring matter; paints and varnishes; putty and other mastics; inks",
  },
  33: {
    th: "น้ำมันหอมระเหยและเรซินอยด์ สิ่งปรุงแต่งกลิ่นหอม สิ่งปรุงแต่งเพื่อการเสริมความงามหรือการแต่งหน้า",
    en: "Essential oils and resinoids; perfumery, cosmetic or toilet preparations",
  },
  34: {
    th: "สบู่ สารอินทรีย์ที่เป็นตัวลดแรงตึงผิว สิ่งปรุงแต่งที่ใช้ชำระล้าง สารหล่อลื่น ไขหรือขี้ผึ้งเทียม",
    en: "Soap, organic surface-active agents, washing preparations, lubricating preparations, artificial waxes, prepared waxes",
  },
  35: {
    th: "สารจำพวกอัลบูมินอยด์ สตาร์ชดัดแปร กาว เอนไซม์",
    en: "Albuminoidal substances; modified starches; glues; enzymes",
  },
  36: {
    th: "วัตถุระเบิด ผลิตภัณฑ์ไพโรเทคนิค ไม้ขีดไฟ โลหะผสมไพโรฟอริก สารติดไฟได้บางชนิด",
    en: "Explosives; pyrotechnic products; matches; pyrophoric alloys; certain combustible preparations",
  },
  37: {
    th: "ของที่ใช้ในการถ่ายภาพหรือถ่ายภาพยนตร์",
    en: "Photographic or cinematographic goods",
  },
  38: { th: "เคมีภัณฑ์เบ็ดเตล็ด", en: "Miscellaneous chemical products" },
  39: {
    th: "พลาสติกและของที่ทำด้วยพลาสติก",
    en: "Plastics and articles thereof",
  },
  40: { th: "ยางและของที่ทำด้วยยาง", en: "Rubber and articles thereof" },
  41: {
    th: "หนังดิบ (นอกจากหนังเฟอร์) และหนังฟอก",
    en: "Raw hides and skins (other than furskins) and leather",
  },
  42: {
    th: "เครื่องหนัง เครื่องเทียมลากและอานม้า เครื่องใช้สำหรับเดินทาง กระเป๋าถือและภาชนะที่คล้ายกัน",
    en: "Articles of leather; saddlery and harness; travel goods, handbags and similar containers; articles of animal gut",
  },
  43: {
    th: "หนังเฟอร์และหนังเฟอร์เทียม รวมทั้งของที่ทำด้วยสิ่งดังกล่าว",
    en: "Furskins and artificial fur; manufactures thereof",
  },
  44: {
    th: "ไม้และของที่ทำด้วยไม้ ถ่านไม้",
    en: "Wood and articles of wood; wood charcoal",
  },
  45: { th: "ไม้ก๊อกและของที่ทำด้วยไม้ก๊อก", en: "Cork and articles of cork" },
  46: {
    th: "ของที่ทำด้วยฟาง เอสพาร์โต หรือวัตถุจักสานอื่นๆ เครื่องจักสานและเครื่องสาน",
    en: "Manufactures of straw, of esparto or of other plaiting materials; basketware and wickerwork",
  },
  47: {
    th: "เยื่อไม้หรือเยื่อที่ได้จากวัตถุจำพวกเส้นใยเซลลูโลสอื่นๆ เศษและของที่ใช้ไม่ได้ที่เป็นกระดาษหรือกระดาษแข็ง",
    en: "Pulp of wood or of other fibrous cellulosic material; recovered (waste and scrap) paper or paperboard",
  },
  48: {
    th: "กระดาษและกระดาษแข็ง ของที่ทำด้วยเยื่อกระดาษ ทำด้วยกระดาษหรือทำด้วยกระดาษแข็ง",
    en: "Paper and paperboard; articles of paper pulp, of paper or of paperboard",
  },
  49: {
    th: "หนังสือ หนังสือพิมพ์ รูปพิมพ์ และผลิตภัณฑ์อื่นๆ ของอุตสาหกรรมการพิมพ์ ต้นฉบับเขียน ต้นฉบับพิมพ์ และแบบผัง",
    en: "Printed books, newspapers, pictures and other products of the printing industry; manuscripts, typescripts and plans",
  },
  50: { th: "ไหม", en: "Silk" },
  51: {
    th: "ขนแกะ ขนละเอียดหรือขนหยาบของสัตว์ ขนหางม้าและผ้าทอจากขนดังกล่าว",
    en: "Wool, fine or coarse animal hair; horsehair yarn and woven fabric",
  },
  52: { th: "ฝ้าย", en: "Cotton" },
  53: {
    th: "เส้นใยสิ่งทอจากพืชอื่นๆ เส้นด้ายกระดาษและผ้าทอจากเส้นด้ายกระดาษ",
    en: "Other vegetable textile fibres; paper yarn and woven fabrics of paper yarn",
  },
  54: {
    th: "ฟิลาเมนต์ประดิษฐ์ แถบและสิ่งคล้ายกันที่ทำด้วยวัตถุสิ่งทอประดิษฐ์",
    en: "Man-made filaments; strip and the like of man-made textile materials",
  },
  55: { th: "สเตเปิลไฟเบอร์ประดิษฐ์", en: "Man-made staple fibres" },
  56: {
    th: "แวดดิง สักหลาดและผ้าไม่ทอ เส้นด้ายชนิดพิเศษ เชือก เชือกถัก สายเคเบิล และของทำด้วยสิ่งดังกล่าว",
    en: "Wadding, felt and nonwovens; special yarns; twine, cordage, ropes and cables and articles thereof",
  },
  57: {
    th: "พรมและสิ่งปูพื้นอื่นๆ ที่ทำด้วยสิ่งทอ",
    en: "Carpets and other textile floor coverings",
  },
  58: {
    th: "ผ้าทอพิเศษ ผ้าทอพื้นผิวมีขน ผ้าลูกไม้ ผ้าทอมือลายขัด ผ้าลายปัก",
    en: "Special woven fabrics; tufted textile fabrics; lace; tapestries; trimmings; embroidery",
  },
  59: {
    th: "ผ้าสิ่งทอเคลือบ ชุบ ทา หรือหุ้ม สิ่งทอชนิดที่เหมาะสำหรับใช้ในทางอุตสาหกรรม",
    en: "Impregnated, coated, covered or laminated textile fabrics; textile articles of a kind suitable for industrial use",
  },
  60: { th: "ผ้าถักแบบนิตหรือโครเชต์", en: "Knitted or crocheted fabrics" },
  61: {
    th: "เครื่องแต่งกายและของประดับเครื่องแต่งกาย ถักแบบนิตหรือโครเชต์",
    en: "Articles of apparel and clothing accessories, knitted or crocheted",
  },
  62: {
    th: "เครื่องแต่งกายและของประดับเครื่องแต่งกาย ที่ไม่ได้ถักแบบนิตหรือโครเชต์",
    en: "Articles of apparel and clothing accessories, not knitted or crocheted",
  },
  63: {
    th: "ของที่ทำด้วยสิ่งทออื่นๆ ที่จัดทำแล้ว ชุด ผ้าและเครื่องแต่งกายที่ใช้แล้ว ผ้าขี้ริ้ว",
    en: "Other made up textile articles; sets; worn clothing and worn textile articles; rags",
  },
  64: {
    th: "รองเท้า สนับแข้ง และของที่คล้ายกัน ส่วนประกอบของของดังกล่าว",
    en: "Footwear, gaiters and the like; parts of such articles",
  },
  65: {
    th: "เครื่องสวมศีรษะและส่วนประกอบของเครื่องสวมศีรษะ",
    en: "Headgear and parts thereof",
  },
  66: {
    th: "ร่ม ร่มบังแดด ไม้เท้า ไม้เท้าที่นั่ง แส้ ม้าขี่ และส่วนประกอบของของดังกล่าว",
    en: "Umbrellas, sun umbrellas, walking-sticks, seat-sticks, whips, riding-crops and parts thereof",
  },
  67: {
    th: "ขนนกและขนดาวน์ที่จัดทำแล้ว และของที่ทำด้วยขนนกหรือขนดาวน์ ดอกไม้เทียม ของที่ทำด้วยเส้นผม",
    en: "Prepared feathers and down and articles made of feathers or of down; artificial flowers; articles of human hair",
  },
  68: {
    th: "ของที่ทำด้วยหิน พลาสเตอร์ ซีเมนต์ แอสเบสตอส ไมกา หรือวัตถุที่คล้ายกัน",
    en: "Articles of stone, plaster, cement, asbestos, mica or similar materials",
  },
  69: { th: "ผลิตภัณฑ์เซรามิก", en: "Ceramic products" },
  70: { th: "แก้วและเครื่องแก้ว", en: "Glass and glassware" },
  71: {
    th: "ไข่มุกธรรมชาติหรือไข่มุกเลี้ยง รัตนชาติหรือกึ่งรัตนชาติ โลหะมีค่า โลหะหุ้มปรับด้วยโลหะมีค่า",
    en: "Natural or cultured pearls, precious or semi-precious stones, precious metals, metals clad with precious metal, and articles thereof",
  },
  72: { th: "เหล็กและเหล็กกล้า", en: "Iron and steel" },
  73: { th: "ของที่ทำด้วยเหล็กหรือเหล็กกล้า", en: "Articles of iron or steel" },
  74: { th: "ทองแดงและของที่ทำด้วยทองแดง", en: "Copper and articles thereof" },
  75: {
    th: "นิกเกิลและของที่ทำด้วยนิกเกิล",
    en: "Nickel and articles thereof",
  },
  76: {
    th: "อะลูมิเนียมและของที่ทำด้วยอะลูมิเนียม",
    en: "Aluminium and articles thereof",
  },
  78: { th: "ตะกั่วและของที่ทำด้วยตะกั่ว", en: "Lead and articles thereof" },
  79: { th: "สังกะสีและของที่ทำด้วยสังกะสี", en: "Zinc and articles thereof" },
  80: { th: "ดีบุกและของที่ทำด้วยดีบุก", en: "Tin and articles thereof" },
  81: {
    th: "โลหะสามัญอื่นๆ เซอร์เมต และของที่ทำด้วยโลหะดังกล่าว",
    en: "Other base metals; cermets; articles thereof",
  },
  82: {
    th: "เครื่องมือ ของมีคม ช้อนและส้อม ทำด้วยโลหะสามัญ ส่วนประกอบของของดังกล่าวทำด้วยโลหะสามัญ",
    en: "Tools, implements, cutlery, spoons and forks, of base metal; parts thereof of base metal",
  },
  83: {
    th: "ของเบ็ดเตล็ดทำด้วยโลหะสามัญ",
    en: "Miscellaneous articles of base metal",
  },
  84: {
    th: "เครื่องปฏิกรณ์นิวเคลียร์ บอยเลอร์ เครื่องจักรและเครื่องกล ส่วนประกอบของเครื่องดังกล่าว",
    en: "Nuclear reactors, boilers, machinery and mechanical appliances; parts thereof",
  },
  85: {
    th: "เครื่องจักรไฟฟ้า เครื่องอุปกรณ์ไฟฟ้า และส่วนประกอบของเครื่องดังกล่าว เครื่องบันทึกและถอดเสียง เครื่องบันทึกและถอดภาพและเสียง",
    en: "Electrical machinery and equipment and parts thereof; sound recorders and reproducers, television image and sound recorders and reproducers",
  },
  86: {
    th: "หัวรถจักร รถไฟ รถราง และส่วนประกอบของสิ่งดังกล่าว เครื่องยึดตรึงรางรถไฟ สัญญาณจราจร",
    en: "Railway or tramway locomotives, rolling-stock and parts thereof; railway or tramway track fixtures and fittings; mechanical traffic signalling equipment",
  },
  87: {
    th: "ยานบกนอกจากรถที่เดินบนรางรถไฟหรือรถราง ส่วนประกอบและอุปกรณ์ประกอบของยานดังกล่าว",
    en: "Vehicles other than railway or tramway rolling-stock, and parts and accessories thereof",
  },
  88: {
    th: "อากาศยาน ยานอวกาศ และส่วนประกอบของยานดังกล่าว",
    en: "Aircraft, spacecraft, and parts thereof",
  },
  89: { th: "เรือและสิ่งลอยน้ำ", en: "Ships, boats and floating structures" },
  90: {
    th: "เครื่องมือและเครื่องใช้ออปติค ถ่ายภาพ ถ่ายภาพยนตร์ วัด ตรวจ วัดความเที่ยง การแพทย์หรือศัลยกรรม",
    en: "Optical, photographic, cinematographic, measuring, checking, precision, medical or surgical instruments and apparatus; parts and accessories thereof",
  },
  91: {
    th: "นาฬิกาชนิดต่างๆ และส่วนประกอบของนาฬิกาดังกล่าว",
    en: "Clocks and watches and parts thereof",
  },
  92: {
    th: "เครื่องดนตรี ส่วนประกอบและอุปกรณ์ประกอบของเครื่องดนตรีดังกล่าว",
    en: "Musical instruments; parts and accessories of such articles",
  },
  93: {
    th: "อาวุธและกระสุน รวมทั้งส่วนประกอบและอุปกรณ์ประกอบของของดังกล่าว",
    en: "Arms and ammunition; parts and accessories thereof",
  },
  94: {
    th: "เฟอร์นิเจอร์ เครื่องเตียง ที่นอน ฟูก หมอน โคมไฟและเครื่องให้แสงสว่าง ป้ายสัญญาณ",
    en: "Furniture; bedding, mattresses, mattress supports, cushions and similar stuffed furnishings; luminaires and lighting fittings",
  },
  95: {
    th: "ของเล่น เกม และของใช้สำหรับเล่นกีฬา ส่วนประกอบและอุปกรณ์ประกอบของของดังกล่าว",
    en: "Toys, games and sports requisites; parts and accessories thereof",
  },
  96: { th: "ผลิตภัณฑ์เบ็ดเตล็ด", en: "Miscellaneous manufactured articles" },
  97: {
    th: "ศิลปวัตถุ ของสะสมสำหรับผู้สะสม และโบราณวัตถุ",
    en: "Works of art, collectors' pieces and antiques",
  },
};

// ==========================================
// 3. If the REFTRC file exists, cross-check chapter titles against the source file
// ==========================================
if (rawFileExists(tariffFile)) {
  console.log(`==> Verifying chapter titles from REFTRC_Open.txt...`);
  try {
    const trcText = readRawText(tariffFile);
    const trcLines = trcText.split(/\r?\n/).filter((l) => l.trim().length > 10);

    trcLines.forEach((line) => {
      // Match main chapter heading lines (0100, 0200, ... 9700)
      const m = line.match(/^(\d{2})0000/);
      if (m) {
        const chStr = m[1];
        if (CHAPTER_DICTIONARY[chStr]) {
          const thaiMatches = line.match(/([\u0E00-\u0E7F\s\-()–—.+%/]+)/g);
          if (thaiMatches && thaiMatches.length > 0) {
            const rawTh = thaiMatches
              .map((s) => s.trim())
              .filter((s) => s.length > 3)
              .join(" ")
              .trim();
            if (rawTh && rawTh.length > CHAPTER_DICTIONARY[chStr].th.length) {
              CHAPTER_DICTIONARY[chStr].th = rawTh;
            }
          }
        }
      }
    });
  } catch (err) {
    console.warn(
      `! Warning: error while reading REFTRC; falling back to the master dictionary: ${err.message}`,
    );
  }
}

// ==========================================
// 4. Build chapters list & map
// ==========================================
const chaptersList = [];
const chaptersMap = {};

for (let i = 1; i <= 97; i++) {
  // Skip chapter 77: it is reserved for future use in the HS system
  if (i === 77) continue;

  const chStr = i < 10 ? `0${i}` : `${i}`;
  const meta = CHAPTER_DICTIONARY[chStr] || {
    th: `ตอนที่ ${i}`,
    en: `Chapter ${i}`,
  };
  const secMeta = findSectionForChapter(i);

  const chapterObj = {
    chapter: chStr,
    chapter_number: i,
    title_th: meta.th,
    title_en: meta.en,
    section_id: secMeta.section_id,
    section_order: secMeta.section_order,
    section_title_th: secMeta.section_title_th,
    section_title_en: secMeta.section_title_en,
  };

  chaptersList.push(chapterObj);
  chaptersMap[chStr] = chapterObj;
}

// Sections grouped structure (useful for UI tree views / dropdowns)
const sectionsGrouped = SECTIONS_MASTER.map((sec) => {
  return {
    section_id: sec.section_id,
    section_order: sec.section_order,
    section_title_th: sec.section_title_th,
    section_title_en: sec.section_title_en,
    total_chapters: sec.chapters.length,
    chapters: sec.chapters
      .filter((ch) => ch !== 77)
      .map((ch) => {
        const chStr = ch < 10 ? `0${ch}` : `${ch}`;
        return chaptersMap[chStr];
      }),
  };
});

// Write JSON output
fs.writeFileSync(
  path.join(resolvedOutputDir, "hs_chapters_list.json"),
  JSON.stringify(chaptersList, null, 2),
  "utf8",
);

fs.writeFileSync(
  path.join(resolvedOutputDir, "hs_chapters_by_code.json"),
  JSON.stringify(chaptersMap, null, 2),
  "utf8",
);

fs.writeFileSync(
  path.join(resolvedOutputDir, "hs_sections_grouped.json"),
  JSON.stringify(sectionsGrouped, null, 2),
  "utf8",
);

console.log(`\n======================================================`);
console.log(
  `==> HS code chapters & sections generated successfully: ${resolvedOutputDir}`,
);
console.log(
  `   1. hs_chapters_list.json     (${chaptersList.length} chapters total - array list)`,
);
console.log(
  `   2. hs_chapters_by_code.json  (key-value dictionary - O(1) lookup, e.g. chapters["08"])`,
);
console.log(
  `   3. hs_sections_grouped.json   (chapters grouped by section I to XXI)`,
);
console.log(`======================================================`);
