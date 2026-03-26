// scripts/generate-th-back-translation.mjs
// Generates docs/test-data/back-translation/th-reference.json
// from yaitron EN-TH corpus + curated linguistic examples

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const tsvPath = join("docs/test-data/yaitron-en-th/data/yaitron_par.tsv");
const lines = readFileSync(tsvPath, "utf-8").split("\n").filter((l) => l.trim());

// Build deduplicated dictionary
const seen = new Set();
const dict = [];
for (const line of lines) {
  const parts = line.split("\t");
  if (parts.length < 2) continue;
  const en = parts[0].trim();
  const th = parts[1].trim();
  if (!en || !th || seen.has(en.toLowerCase())) continue;
  seen.add(en.toLowerCase());
  dict.push({ en, th });
}

// Find entries matching keywords
function findByKeywords(keywords, limit) {
  const result = [];
  for (const e of dict) {
    if (result.length >= limit) break;
    if (e._used) continue;
    const match = keywords.some((k) =>
      e.en.toLowerCase().includes(k.toLowerCase())
    );
    if (match && e.en.length > 3 && e.th.length > 6 && !e.th.endsWith('.')) {
      e._used = true;
      result.push(e);
    }
  }
  return result;
}

const segments = [];
let id = 0;

// =============================================
// Category 1: Direct translation (~40)
// =============================================
const directTerms = [
  ...findByKeywords(
    [
      "technology",
      "computer",
      "software",
      "hardware",
      "digital",
      "internet",
      "electronic",
      "automatic",
    ],
    10
  ),
  ...findByKeywords(
    [
      "law",
      "constitution",
      "legislation",
      "regulation",
      "government",
      "jurisdiction",
    ],
    7
  ),
  ...findByKeywords(
    ["tax", "budget", "income", "finance", "investment", "account"],
    7
  ),
  ...findByKeywords(
    ["medical", "hospital", "surgery", "disease", "treatment", "patient"],
    6
  ),
  ...findByKeywords(
    ["market", "contract", "registration", "organization", "company"],
    5
  ),
  ...findByKeywords(
    ["education", "school", "library", "research", "examination"],
    5
  ),
];

for (const e of directTerms.slice(0, 40)) {
  id++;
  segments.push({
    id,
    source_en: e.en,
    target: e.th,
    reference_back_translation: e.en,
    notes:
      "Direct translation - technical/formal term. Back-translation should match source exactly.",
  });
}

// =============================================
// Category 2: Politeness particles (~15)
// =============================================
const politeEntries = [
  {
    en: "thank",
    th: "\u0e04\u0e33\u0e02\u0e2d\u0e1a\u0e04\u0e38\u0e13",
    note: "Thai adds gender-specific politeness particle: \u0e02\u0e2d\u0e1a\u0e04\u0e38\u0e13\u0e04\u0e23\u0e31\u0e1a (male) / \u0e02\u0e2d\u0e1a\u0e04\u0e38\u0e13\u0e04\u0e48\u0e30 (female). English has no equivalent.",
  },
  {
    en: "excuse",
    th: "\u0e04\u0e33\u0e02\u0e2d\u0e42\u0e17\u0e29",
    note: "Thai adds particle: \u0e02\u0e2d\u0e42\u0e17\u0e29\u0e04\u0e23\u0e31\u0e1a/\u0e04\u0e48\u0e30 required in formal speech. Omitting is rude.",
  },
  {
    en: "hello",
    th: "\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35",
    note: "Thai always adds particle: \u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35\u0e04\u0e23\u0e31\u0e1a (male) / \u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35\u0e04\u0e48\u0e30 (female). Particle indicates speaker gender.",
  },
  {
    en: "please",
    th: "\u0e01\u0e23\u0e38\u0e13\u0e32",
    note: "Thai formal: \u0e01\u0e23\u0e38\u0e13\u0e32. Soft request uses \u0e19\u0e30 particle. \u0e19\u0e30 softens tone, no English equivalent.",
  },
  {
    en: "understand",
    th: "\u0e40\u0e02\u0e49\u0e32\u0e43\u0e08",
    note: "Thai response: \u0e40\u0e02\u0e49\u0e32\u0e43\u0e08\u0e04\u0e23\u0e31\u0e1a/\u0e04\u0e48\u0e30 (I understand + polite particle). Without particle sounds curt.",
  },
  {
    en: "agree",
    th: "\u0e40\u0e2b\u0e47\u0e19\u0e14\u0e49\u0e27\u0e22",
    note: "Thai: \u0e40\u0e2b\u0e47\u0e19\u0e14\u0e49\u0e27\u0e22\u0e04\u0e23\u0e31\u0e1a/\u0e04\u0e48\u0e30. \u0e19\u0e30 variant softens: \u0e40\u0e2b\u0e47\u0e19\u0e14\u0e49\u0e27\u0e22\u0e19\u0e30",
  },
  {
    en: "confirm",
    th: "\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19",
    note: "\u0e04\u0e30 (rising tone) for questions: \u0e22\u0e37\u0e19\u0e22\u0e31\u0e19\u0e04\u0e30? vs \u0e04\u0e48\u0e30 (falling) for statements.",
  },
  {
    en: "request",
    th: "\u0e04\u0e33\u0e27\u0e34\u0e07\u0e27\u0e2d\u0e19",
    note: "Formal request: \u0e02\u0e2d...\u0e14\u0e49\u0e27\u0e22\u0e04\u0e23\u0e31\u0e1a/\u0e04\u0e48\u0e30. Multiple particles can stack in polite speech.",
  },
  {
    en: "welcome",
    th: "\u0e15\u0e49\u0e2d\u0e19\u0e23\u0e31\u0e1a",
    note: "Thai: \u0e22\u0e34\u0e19\u0e14\u0e35\u0e15\u0e49\u0e2d\u0e19\u0e23\u0e31\u0e1a\u0e04\u0e23\u0e31\u0e1a/\u0e04\u0e48\u0e30. Often followed by \u0e19\u0e30\u0e04\u0e23\u0e31\u0e1a/\u0e19\u0e30\u0e04\u0e30 for warmth.",
  },
  {
    en: "goodbye",
    th: "\u0e25\u0e32\u0e01\u0e48\u0e2d\u0e19",
    note: "Thai: \u0e25\u0e32\u0e01\u0e48\u0e2d\u0e19\u0e19\u0e30\u0e04\u0e23\u0e31\u0e1a/\u0e19\u0e30\u0e04\u0e30. \u0e19\u0e30 particle adds warmth/gentleness to farewell.",
  },
  {
    en: "how are you",
    th: "\u0e2a\u0e1a\u0e32\u0e22\u0e14\u0e35\u0e44\u0e2b\u0e21",
    note: "Thai adds particle: \u0e2a\u0e1a\u0e32\u0e22\u0e14\u0e35\u0e44\u0e2b\u0e21\u0e04\u0e30? (female asking). \u0e44\u0e2b\u0e21 is question particle, \u0e04\u0e30 is politeness.",
  },
  {
    en: "congratulations",
    th: "\u0e41\u0e2a\u0e14\u0e07\u0e04\u0e27\u0e32\u0e21\u0e22\u0e34\u0e19\u0e14\u0e35",
    note: "Thai: \u0e22\u0e34\u0e19\u0e14\u0e35\u0e14\u0e49\u0e27\u0e22\u0e19\u0e30\u0e04\u0e23\u0e31\u0e1a/\u0e19\u0e30\u0e04\u0e30. \u0e19\u0e30 particle makes congratulations feel genuine.",
  },
  {
    en: "I am sorry",
    th: "\u0e02\u0e2d\u0e42\u0e17\u0e29",
    note: "Thai: \u0e02\u0e2d\u0e42\u0e17\u0e29\u0e19\u0e30\u0e04\u0e23\u0e31\u0e1a/\u0e19\u0e30\u0e04\u0e30. \u0e19\u0e30 softens the apology. Without particle sounds impersonal.",
  },
  {
    en: "never mind",
    th: "\u0e44\u0e21\u0e48\u0e40\u0e1b\u0e47\u0e19\u0e44\u0e23",
    note: "Thai: \u0e44\u0e21\u0e48\u0e40\u0e1b\u0e47\u0e19\u0e44\u0e23\u0e04\u0e23\u0e31\u0e1a/\u0e04\u0e48\u0e30. \u0e08\u0e49\u0e30/\u0e08\u0e4a\u0e30 used by older speakers to younger.",
  },
  {
    en: "yes",
    th: "\u0e43\u0e0a\u0e48",
    note: "Thai: \u0e04\u0e23\u0e31\u0e1a (male yes) / \u0e04\u0e48\u0e30 (female yes). \u0e43\u0e0a\u0e48 is informal. Formal male: \u0e04\u0e23\u0e31\u0e1a\u0e1c\u0e21",
  },
];

for (const e of politeEntries) {
  id++;
  segments.push({
    id,
    source_en: e.en,
    target: e.th,
    reference_back_translation: e.en,
    notes: "Politeness particle - " + e.note,
  });
}

// =============================================
// Category 3: Compound words (~15)
// =============================================
const compoundWords = [
  {
    en: "hospital",
    th: "\u0e42\u0e23\u0e07\u0e1e\u0e22\u0e32\u0e1a\u0e32\u0e25",
    note: "Compound: \u0e42\u0e23\u0e07 (building) + \u0e1e\u0e22\u0e32\u0e1a\u0e32\u0e25 (nursing). Must not decompose into separate words.",
  },
  {
    en: "university",
    th: "\u0e21\u0e2b\u0e32\u0e27\u0e34\u0e17\u0e22\u0e32\u0e25\u0e31\u0e22",
    note: "Compound: \u0e21\u0e2b\u0e32 (great) + \u0e27\u0e34\u0e17\u0e22\u0e32\u0e25\u0e31\u0e22 (college). Single concept, not 'great college'.",
  },
  {
    en: "motorcycle",
    th: "\u0e23\u0e16\u0e08\u0e31\u0e01\u0e23\u0e22\u0e32\u0e19\u0e22\u0e19\u0e15\u0e4c",
    note: "Compound: \u0e23\u0e16 (vehicle) + \u0e08\u0e31\u0e01\u0e23\u0e22\u0e32\u0e19 (bicycle) + \u0e22\u0e19\u0e15\u0e4c (engine). Must translate as single unit.",
  },
  {
    en: "airplane",
    th: "\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e1a\u0e34\u0e19",
    note: "Compound: \u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07 (machine) + \u0e1a\u0e34\u0e19 (fly). Decomposition loses meaning.",
  },
  {
    en: "refrigerator",
    th: "\u0e15\u0e39\u0e49\u0e40\u0e22\u0e47\u0e19",
    note: "Compound: \u0e15\u0e39\u0e49 (cabinet) + \u0e40\u0e22\u0e47\u0e19 (cold). Not 'cold cabinet' - it is a single appliance concept.",
  },
  {
    en: "telephone",
    th: "\u0e42\u0e17\u0e23\u0e28\u0e31\u0e1e\u0e17\u0e4c",
    note: "Compound: \u0e42\u0e17\u0e23 (far/tele) + \u0e28\u0e31\u0e1e\u0e17\u0e4c (sound/speech). Pali-Sanskrit loanword compound.",
  },
  {
    en: "railway",
    th: "\u0e17\u0e32\u0e07\u0e23\u0e16\u0e44\u0e1f",
    note: "Compound: \u0e17\u0e32\u0e07 (way) + \u0e23\u0e16\u0e44\u0e1f (train). \u0e23\u0e16\u0e44\u0e1f itself is compound: \u0e23\u0e16 (vehicle) + \u0e44\u0e1f (fire).",
  },
  {
    en: "volcano",
    th: "\u0e20\u0e39\u0e40\u0e02\u0e32\u0e44\u0e1f",
    note: "Compound: \u0e20\u0e39\u0e40\u0e02\u0e32 (mountain) + \u0e44\u0e1f (fire). Literal 'fire mountain' but must translate as 'volcano'.",
  },
  {
    en: "globalization",
    th: "\u0e42\u0e25\u0e01\u0e32\u0e20\u0e34\u0e27\u0e31\u0e15\u0e19\u0e4c",
    note: "Compound: \u0e42\u0e25\u0e01\u0e32 (world) + \u0e2d\u0e20\u0e34\u0e27\u0e31\u0e15\u0e19\u0e4c (development). Pali-derived neologism.",
  },
  {
    en: "democracy",
    th: "\u0e1b\u0e23\u0e30\u0e0a\u0e32\u0e18\u0e34\u0e1b\u0e44\u0e15\u0e22",
    note: "Compound: \u0e1b\u0e23\u0e30\u0e0a\u0e32 (people) + \u0e18\u0e34\u0e1b\u0e44\u0e15\u0e22 (sovereignty). Must not decompose.",
  },
  {
    en: "television set",
    th: "\u0e08\u0e2d\u0e23\u0e31\u0e1a\u0e20\u0e32\u0e1e",
    note: "Compound: \u0e08\u0e2d (screen) + \u0e23\u0e31\u0e1a (receive) + \u0e20\u0e32\u0e1e (image). Formal Thai term for TV.",
  },
  {
    en: "automatic transmission car",
    th: "\u0e23\u0e16\u0e22\u0e19\u0e15\u0e4c\u0e40\u0e01\u0e35\u0e22\u0e23\u0e4c\u0e2d\u0e31\u0e15\u0e42\u0e19\u0e21\u0e31\u0e15\u0e34",
    note: "Multi-word compound: \u0e23\u0e16\u0e22\u0e19\u0e15\u0e4c (car) + \u0e40\u0e01\u0e35\u0e22\u0e23\u0e4c (gear) + \u0e2d\u0e31\u0e15\u0e42\u0e19\u0e21\u0e31\u0e15\u0e34 (automatic).",
  },
  {
    en: "air conditioning",
    th: "\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e1b\u0e23\u0e31\u0e1a\u0e2d\u0e32\u0e01\u0e32\u0e28",
    note: "Compound: \u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07 (machine) + \u0e1b\u0e23\u0e31\u0e1a (adjust) + \u0e2d\u0e32\u0e01\u0e32\u0e28 (air). Descriptive compound.",
  },
  {
    en: "department store",
    th: "\u0e2b\u0e49\u0e32\u0e07\u0e2a\u0e23\u0e23\u0e1e\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32",
    note: "Compound: \u0e2b\u0e49\u0e32\u0e07 (store) + \u0e2a\u0e23\u0e23\u0e1e (all) + \u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32 (goods). Formal; colloquial uses \u0e2b\u0e49\u0e32\u0e07 alone.",
  },
  {
    en: "ice cream",
    th: "\u0e44\u0e2d\u0e28\u0e01\u0e23\u0e35\u0e21",
    note: "Compound loanword: Transliteration treated as single Thai compound. Thai also uses \u0e01\u0e30\u0e41\u0e25\u0e30\u0e21 (rare).",
  },
];

for (const e of compoundWords) {
  id++;
  segments.push({
    id,
    source_en: e.en,
    target: e.th,
    reference_back_translation: e.en,
    notes: "Compound word - " + e.note,
  });
}

// =============================================
// Category 4: Cultural adaptation (~10)
// =============================================
const culturalEntries = [
  {
    en: "Buddhist monk",
    th: "\u0e20\u0e34\u0e01\u0e29\u0e38\u0e2a\u0e07\u0e06\u0e4c",
    note: "Thai Buddhism: \u0e1e\u0e23\u0e30/\u0e20\u0e34\u0e01\u0e29\u0e38/\u0e2a\u0e07\u0e06\u0e4c all mean monk but different formality. \u0e20\u0e34\u0e01\u0e29\u0e38\u0e2a\u0e07\u0e06\u0e4c is Pali-formal.",
  },
  {
    en: "auspicious ceremony",
    th: "\u0e07\u0e32\u0e19\u0e21\u0e07\u0e04\u0e25",
    note: "Thai ceremonies: \u0e07\u0e32\u0e19 (event) + \u0e21\u0e07\u0e04\u0e25 (auspicious). Covers weddings, housewarming, ordination.",
  },
  {
    en: "Buddhist principles",
    th: "\u0e2b\u0e25\u0e31\u0e01\u0e1e\u0e23\u0e30\u0e1e\u0e38\u0e17\u0e18\u0e28\u0e32\u0e2a\u0e19\u0e32",
    note: "Buddhism permeates Thai daily language. \u0e2b\u0e25\u0e31\u0e01 (principle) + \u0e1e\u0e23\u0e30\u0e1e\u0e38\u0e17\u0e18\u0e28\u0e32\u0e2a\u0e19\u0e32 (Buddhism).",
  },
  {
    en: "temple",
    th: "\u0e27\u0e31\u0e14",
    note: "\u0e27\u0e31\u0e14 is specifically Buddhist temple. Different from \u0e28\u0e32\u0e25\u0e40\u0e08\u0e49\u0e32 (Chinese shrine) or \u0e42\u0e1a\u0e2a\u0e16\u0e4c (church).",
  },
  {
    en: "merit making",
    th: "\u0e17\u0e33\u0e1a\u0e38\u0e0d",
    note: "\u0e17\u0e33\u0e1a\u0e38\u0e0d (make merit) is central to Thai Buddhist practice. No single English equivalent captures the concept.",
  },
  {
    en: "karma",
    th: "\u0e01\u0e23\u0e23\u0e21",
    note: "\u0e01\u0e23\u0e23\u0e21 in Thai implies both action and consequence. Used in daily speech.",
  },
  {
    en: "spirit house",
    th: "\u0e28\u0e32\u0e25\u0e1e\u0e23\u0e30\u0e20\u0e39\u0e21\u0e34",
    note: "\u0e28\u0e32\u0e25\u0e1e\u0e23\u0e30\u0e20\u0e39\u0e21\u0e34 is miniature shrine for guardian spirits. Unique to Thai/SE Asian culture.",
  },
  {
    en: "prostration",
    th: "\u0e01\u0e23\u0e32\u0e1a",
    note: "\u0e01\u0e23\u0e32\u0e1a is specific Thai gesture of respect (forehead to floor). For monks, elders, royalty.",
  },
  {
    en: "ordination",
    th: "\u0e1a\u0e27\u0e0a",
    note: "\u0e1a\u0e27\u0e0a (ordination as monk) is rite of passage for Thai men. Temporary ordination is common.",
  },
  {
    en: "water festival",
    th: "\u0e2a\u0e07\u0e01\u0e23\u0e32\u0e19\u0e15\u0e4c",
    note: "\u0e2a\u0e07\u0e01\u0e23\u0e32\u0e19\u0e15\u0e4c (Songkran) is Thai New Year. 'Water festival' is cultural adaptation, not literal translation.",
  },
];

for (const e of culturalEntries) {
  id++;
  segments.push({
    id,
    source_en: e.en,
    target: e.th,
    reference_back_translation: e.en,
    notes: "Cultural adaptation - " + e.note,
  });
}

// =============================================
// Category 5: Tone markers (~10)
// =============================================
const toneEntries = [
  {
    en: "near",
    th: "\u0e43\u0e01\u0e25\u0e49",
    note: "\u0e43\u0e01\u0e25\u0e49 (glai, falling tone) = near. Without mark: \u0e44\u0e01\u0e25 (glai, mid tone) = far. Opposite meanings!",
  },
  {
    en: "new",
    th: "\u0e43\u0e2b\u0e21\u0e48",
    note: "\u0e43\u0e2b\u0e21\u0e48 (mai, falling) = new. \u0e44\u0e2b\u0e21 (mai, rising) = question particle. \u0e44\u0e21\u0e48 (mai, low) = not.",
  },
  {
    en: "forest",
    th: "\u0e1b\u0e48\u0e32",
    note: "\u0e1b\u0e48\u0e32 (bpaa, low tone) = forest. \u0e1b\u0e49\u0e32 (bpaa, falling) = aunt. \u0e1b\u0e32 (bpaa, mid) = to throw.",
  },
  {
    en: "horse",
    th: "\u0e21\u0e49\u0e32",
    note: "\u0e21\u0e49\u0e32 (maa, high tone) = horse. \u0e21\u0e32 (maa, mid) = come. \u0e2b\u0e21\u0e32 (maa, rising) = dog.",
  },
  {
    en: "eye",
    th: "\u0e15\u0e32",
    note: "\u0e15\u0e32 (dtaa, mid tone) = eye/grandfather. \u0e15\u0e48\u0e32 (low) = low. Tone changes meaning entirely.",
  },
  {
    en: "rice",
    th: "\u0e02\u0e49\u0e32\u0e27",
    note: "\u0e02\u0e49\u0e32\u0e27 (kaao, falling) = rice. \u0e02\u0e32\u0e27 (kaao, rising) = white. \u0e40\u0e02\u0e49\u0e32 (kao, falling) = enter.",
  },
  {
    en: "beautiful",
    th: "\u0e2a\u0e27\u0e22",
    note: "\u0e2a\u0e27\u0e22 (suai, rising) = beautiful. \u0e0b\u0e27\u0e22 (suai, mid) = unlucky. Tone confusion changes meaning drastically.",
  },
  {
    en: "medicine",
    th: "\u0e22\u0e32",
    note: "\u0e22\u0e32 (yaa, mid) = medicine. \u0e22\u0e48\u0e32 (yaa, low) = paternal grandmother. Tone is critical.",
  },
  {
    en: "cloth",
    th: "\u0e1c\u0e49\u0e32",
    note: "\u0e1c\u0e49\u0e32 (paa, falling) = cloth. \u0e1d\u0e49\u0e32 (faa, falling) = misty. \u0e1f\u0e49\u0e32 (faa, high) = sky.",
  },
  {
    en: "island",
    th: "\u0e40\u0e01\u0e32\u0e30",
    note: "\u0e40\u0e01\u0e32\u0e30 (go, low tone) = island. \u0e40\u0e01\u0e49\u0e32 (gao, falling) = nine. \u0e40\u0e01\u0e48\u0e32 (gao, low) = old.",
  },
];

for (const e of toneEntries) {
  id++;
  segments.push({
    id,
    source_en: e.en,
    target: e.th,
    reference_back_translation: e.en,
    notes: "Tone marker - " + e.note,
  });
}

// =============================================
// Category 6: Mixed Thai+English (~10)
// =============================================
const mixedEntries = [
  {
    en: "bar code",
    th: "\u0e1a\u0e32\u0e23\u0e4c\u0e42\u0e04\u0e49\u0e14",
    note: "English loanword transliterated to Thai script. Back-translation must map to original English term.",
  },
  {
    en: "E-Commerce",
    th: "\u0e2d\u0e35-\u0e04\u0e2d\u0e21\u0e40\u0e21\u0e34\u0e23\u0e4c\u0e0a",
    note: "English tech term transliterated. Thai retains English concept but in Thai script.",
  },
  {
    en: "Automatic Teller Machine",
    th: "\u0e15\u0e39\u0e49\u0e40\u0e2d\u0e17\u0e35\u0e40\u0e2d\u0e47\u0e21",
    note: "\u0e15\u0e39\u0e49 (cabinet/machine) + \u0e40\u0e2d\u0e17\u0e35\u0e40\u0e2d\u0e47\u0e21 (ATM transliterated). Hybrid Thai+English compound.",
  },
  {
    en: "biotechnology",
    th: "\u0e44\u0e1a\u0e42\u0e2d\u0e40\u0e17\u0e04\u0e42\u0e19\u0e42\u0e25\u0e22\u0e35",
    note: "Full English word transliterated to Thai. Common in scientific/tech vocabulary.",
  },
  {
    en: "online",
    th: "\u0e2d\u0e2d\u0e19\u0e44\u0e25\u0e19\u0e4c",
    note: "Direct transliteration. Thai has no native equivalent; English tech term adopted.",
  },
  {
    en: "website",
    th: "\u0e40\u0e27\u0e47\u0e1a\u0e44\u0e0b\u0e15\u0e4c",
    note: "Transliterated English. \u0e40\u0e27\u0e47\u0e1a (web) + \u0e44\u0e0b\u0e15\u0e4c (site) in Thai script.",
  },
  {
    en: "download",
    th: "\u0e14\u0e32\u0e27\u0e19\u0e4c\u0e42\u0e2b\u0e25\u0e14",
    note: "Transliteration of English tech term. Thai has no native equivalent.",
  },
  {
    en: "chocolate",
    th: "\u0e0a\u0e47\u0e2d\u0e01\u0e42\u0e01\u0e41\u0e25\u0e15",
    note: "Food loanword. Thai transliteration preserves English pronunciation approximately.",
  },
  {
    en: "computer",
    th: "\u0e04\u0e2d\u0e21\u0e1e\u0e34\u0e27\u0e40\u0e15\u0e2d\u0e23\u0e4c",
    note: "Transliterated English. Formal Thai: \u0e04\u0e13\u0e34\u0e15\u0e01\u0e23\u0e13\u0e4c (rarely used). Loanword dominates.",
  },
  {
    en: "taxi",
    th: "\u0e41\u0e17\u0e47\u0e01\u0e0b\u0e35\u0e48",
    note: "English loanword transliterated. Thai tone marks added to approximate English pronunciation.",
  },
];

for (const e of mixedEntries) {
  id++;
  segments.push({
    id,
    source_en: e.en,
    target: e.th,
    reference_back_translation: e.en,
    notes: "Mixed Thai+English - " + e.note,
  });
}

// Write output
const outPath = join("docs/test-data/back-translation/th-reference.json");
writeFileSync(outPath, JSON.stringify(segments, null, 2), "utf-8");
console.log(`Wrote ${segments.length} segments to ${outPath}`);

// Print category counts
const cats = {};
for (const s of segments) {
  const cat = s.notes.split(" - ")[0];
  cats[cat] = (cats[cat] || 0) + 1;
}
console.log("Category breakdown:", cats);
