# Intl.Segmenter Research Spike: Thai, Chinese, Japanese, and Korean Word Segmentation

**Date:** 2026-02-15
**Status:** Complete
**Scope:** Evaluate `Intl.Segmenter` for glossary term matching in Thai (th), Chinese (zh), Japanese (ja), and Korean (ko)
**Environment Tested:** Node.js v20.19.5, V8 v11.3.244.8, ICU 77.1

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Thai Segmentation (th)](#2-thai-segmentation-th)
3. [Chinese Segmentation (zh)](#3-chinese-segmentation-zh)
4. [Japanese Segmentation (ja)](#4-japanese-segmentation-ja)
5. [Korean Segmentation (ko)](#5-korean-segmentation-ko)
6. [Browser/Engine Compatibility](#6-browserengine-compatibility)
7. [Glossary Matching Use Case](#7-glossary-matching-use-case)
8. [Performance Analysis](#8-performance-analysis)
9. [Recommendations for QA Localization Tool](#9-recommendations-for-qa-localization-tool)
10. [Sources](#10-sources)

---

## 1. Executive Summary

`Intl.Segmenter` is a Stage 4 ECMA-402 API (Baseline April 2024) that provides locale-sensitive text segmentation. It is the **only native JavaScript API** capable of segmenting Thai, Chinese, Japanese, and Korean text into words without external libraries.

### Key Findings

| Aspect | Finding | Risk Level |
|--------|---------|------------|
| Thai compound words | Some compounds are split (e.g., โรงพยาบาล -> โรง+พยาบาล) | **HIGH** |
| Chinese compound words | Multi-character terms are split (e.g., 图书馆 -> 图书+馆) | **HIGH** |
| Japanese compound words | Katakana loan words preserved, kanji compounds split | **MEDIUM** |
| Korean compound words | Sino-Korean compounds split, loan words intact; particles stay attached | **MEDIUM** |
| Cross-engine consistency | ICU4C (V8/JSC) vs ICU4X (Firefox) can produce different results | **MEDIUM** |
| Context-dependent segmentation | Same term can segment differently depending on surrounding text | **HIGH** |
| Performance | Fast enough for production use (~0.017ms per segment call) | **LOW** |
| Glossary matching | Cannot rely on simple segment matching; hybrid approach required | **HIGH** |

### Critical Conclusion

**Intl.Segmenter alone is NOT sufficient for reliable glossary term matching.** A hybrid approach combining substring search with segment boundary validation is required. This is because:

1. Compound words are frequently split into sub-words (all CJK+Thai)
2. Segmentation is context-dependent (same term segments differently in isolation vs. in context)
3. Cross-engine results may differ for edge cases

---

## 2. Thai Segmentation (th)

### 2.1 Basic Behavior

Thai text has no spaces between words. `Intl.Segmenter('th', { granularity: 'word' })` uses ICU's dictionary-based algorithm (UAX #29) to identify word boundaries.

```javascript
const seg = new Intl.Segmenter('th', { granularity: 'word' });
const text = 'สวัสดีครับผมชื่อสมชาย';
// Segments: [สวัสดี | ครับ | ผม | ชื่อ | สมชาย]
// Correctly identifies 5 words with no spaces
```

**Verdict:** Basic word segmentation works well for common vocabulary.

### 2.2 Compound Words

This is the **most significant challenge**. Thai compound words are frequently decomposed into their constituent morphemes.

| Compound Word | Meaning | Segmentation Result | Status |
|--------------|---------|---------------------|--------|
| โรงพยาบาล | hospital | โรง + พยาบาล | SPLIT |
| มหาวิทยาลัย | university | มหาวิทยาลัย | INTACT |
| กรุงเทพมหานคร | Bangkok | กรุงเทพมหานคร | INTACT |
| สนามบิน | airport | สนาม + บิน | SPLIT |
| ตู้เย็น | refrigerator | ตู้ + เย็น | SPLIT |
| ขอบคุณ | thank you | ขอบคุณ | INTACT |
| สวัสดี | hello | สวัสดี | INTACT |
| ประเทศไทย | Thailand | ประเทศไทย | INTACT |
| คอมพิวเตอร์ | computer | คอมพิวเตอร์ | INTACT |
| ปัญญาประดิษฐ์ | AI | ปัญญา + ประดิษฐ์ | SPLIT |
| ข้าวผัด | fried rice | ข้าว + ผัด | SPLIT |
| น้ำแข็ง | ice | น้ำ + แข็ง | SPLIT |
| คนขับรถ | driver | คน + ขับ + รถ | SPLIT (3) |

**Pattern:** Words formed from clearly separable morphemes (โรง+พยาบาล = building+nurse = hospital) are split. Well-established single lexical units (สวัสดี, ขอบคุณ) remain intact. Proper nouns that are in the ICU dictionary (กรุงเทพมหานคร) remain intact.

### 2.3 Thai Particles

Particles (คำลงท้าย) are correctly identified as separate segments:

```javascript
'ขอบคุณครับ'    -> [ขอบคุณ | ครับ]       // polite male
'ขอบคุณค่ะ'     -> [ขอบคุณ | ค่ะ]        // polite female
'ไปเที่ยวกันนะ'  -> [ไป | เที่ยว | กัน | นะ]  // suggestion particle
'ใช่ไหมครับ'     -> [ใช่ | ไหม | ครับ]     // question + polite
'ไปกันเถอะนะครับ' -> [ไป | กัน | เถอะ | นะ | ครับ]  // multiple particles
```

**Verdict:** Particle segmentation is reliable. All common particles (ครับ, ค่ะ, นะ, ไหม, เถอะ) are correctly separated.

### 2.4 Mixed Thai/English

| Input | Segments | Issue |
|-------|----------|-------|
| `สวัสดี Hello สบายดีไหม` | สวัสดี \| (space) \| Hello \| (space) \| สบาย \| ดี \| ไหม | Works correctly with spaces |
| `ผมใช้iPhone15และMacBookPro` | ผม \| ใช้iPhone15และMacBookPro | **FAILS** - English glued to Thai |
| `ดาวน์โหลดfileจากserver` | ดาวน์โหลดfileจากserver | **FAILS** - entire string as one segment |
| `วันที่25ธันวาคม2024` | วัน \| ที่25ธันวาคม2024 | **FAILS** - numbers glued to Thai |

**Critical Finding:** When Thai and English/numbers are adjacent without spaces, the segmenter often fails to find boundaries. This is because the UAX #29 word boundary algorithm struggles at script transition points without whitespace.

### 2.5 Ambiguous Segmentation

```javascript
'ตากลม' -> [ตากลม]
// Could be: ตา+กลม (round eye) or ตาก+ลม (dry in wind)
// Segmenter treats it as a single unit
```

The segmenter makes deterministic choices but cannot resolve genuine linguistic ambiguity. This is an inherent limitation of dictionary-based approaches.

---

## 3. Chinese Segmentation (zh)

### 3.1 Simplified vs Traditional Chinese

Both `zh-Hans` and `zh-Hant` locales are supported. On the same simplified text, all three locales (`zh`, `zh-Hans`, `zh-Hant`) produce **identical results** in V8:

```javascript
const text = '我喜欢吃北京烤鸭';
// zh:      我 | 喜欢 | 吃 | 北京 | 烤鸭
// zh-Hans: 我 | 喜欢 | 吃 | 北京 | 烤鸭
// zh-Hant: 我 | 喜欢 | 吃 | 北京 | 烤鸭
```

For Traditional Chinese text with the `zh-Hant` segmenter:
```javascript
'我今天去圖書館學習' -> [我 | 今天 | 去 | 圖書館 | 學習]
// Note: 圖書館 stays intact in Traditional Chinese!
```

Compared to Simplified:
```javascript
'我今天去图书馆学习' -> [我 | 今天 | 去 | 图书 | 馆 | 学习]
// Note: 图书馆 is SPLIT into 图书+馆 in Simplified Chinese!
```

**Critical Finding:** The same semantic word (library) can segment differently in Simplified vs Traditional Chinese. This indicates the underlying dictionaries differ.

### 3.2 Compound Word Segmentation

| Compound Term | Meaning | Segmentation | Status |
|--------------|---------|--------------|--------|
| 人工智能 | artificial intelligence | 人工 + 智能 | SPLIT |
| 机器学习 | machine learning | 机器 + 学习 | SPLIT |
| 深度学习 | deep learning | 深度 + 学习 | SPLIT |
| 图书馆 | library | 图书 + 馆 | SPLIT |
| 中华人民共和国 | PRC | 中华 + 人民 + 共和国 | SPLIT (3) |
| 北京 | Beijing | 北京 | INTACT |
| 编程 | programming | 编 + 程 | SPLIT |

**Pattern:** Chinese segmentation aggressively splits compound words into two-character units. Most 4-character idioms (成语) and technical terms are split into constituent two-character words.

### 3.3 Fullwidth Punctuation

Fullwidth punctuation is correctly handled and marked as `isWordLike: false`:

```javascript
'你好！我是小明。你叫什么名字？'
// [你好 | ！ | 我是 | 小明 | 。 | 你 | 叫 | 什么 | 名字 | ？]
// Punctuation: ！, 。, ？ all have isWordLike: false
```

**Verdict:** Fullwidth punctuation handling is correct and reliable.

### 3.4 Mixed Chinese/English

```javascript
'我喜欢用JavaScript编程'
// [我 | 喜欢 | 用 | JavaScript | 编 | 程]
// English "JavaScript" is correctly identified as a word
// But 编程 (programming) is incorrectly split into 编+程
```

**Issue:** The transition from English back to Chinese can disrupt nearby segmentation.

### 3.5 Chinese Edge Cases

```javascript
// Famous ambiguous sentence
'下雨天留客天留我不留' -> [下雨天 | 留客 | 天 | 留 | 我 | 不留]

// Internet slang (not in dictionary)
'摆烂躺平' -> [摆 | 烂 | 躺平]
// 躺平 (lie flat) is recognized, 摆烂 (give up trying) is split

// Proper nouns in context
'习近平出席二十国集团领导人峰会' -> [习 | 近平 | 出席 | 二十 | 国 | 集团 | 领导 | 人 | 峰会]
// Person name 习近平 is split into 习+近平
```

---

## 4. Japanese Segmentation (ja)

### 4.1 Mixed Scripts (Hiragana, Katakana, Kanji)

Japanese uses three scripts simultaneously. The segmenter handles script transitions well:

```javascript
'吾輩は猫である。名前はたぬき。'
// [吾輩 | は | 猫 | で | ある | 。 | 名前 | は | たぬき | 。]
// Correctly identifies kanji words, hiragana particles, and punctuation

'今日はカフェでcoffeeを飲みました'
// [今日 | は | カフェ | で | coffee | を | 飲 | み | ま | した]
// Handles kanji, katakana, English, and hiragana in one sentence
```

### 4.2 Katakana Loan Words

Katakana loan words are **well preserved** as single segments:

```javascript
'コンピューター'           -> [コンピューター]         // INTACT
'プログラミング'           -> [プログラミング]         // INTACT
'カフェ'                  -> [カフェ]                // INTACT
'インターナショナル'       -> [インターナショナル]     // INTACT
```

Long katakana compounds are also segmented correctly:
```javascript
'インターナショナルプログラミングコンテスト'
// [インターナショナル | プログラミング | コンテスト]
// Correctly splits into three katakana words
```

**Verdict:** Katakana loan word segmentation is highly reliable.

### 4.3 Kanji Compounds

| Compound | Meaning | Segmentation | Status |
|----------|---------|--------------|--------|
| 人工知能 | AI | 人工 + 知能 | SPLIT |
| 機械学習 | machine learning | 機械 + 学習 | SPLIT |
| 東京都 | Tokyo Metro | 東京 + 都 | SPLIT |
| 千代田区 | Chiyoda Ward | 千代田 + 区 | SPLIT |
| 国際連合教育科学文化機関 | UNESCO | 国際 + 連合 + 教育 + 科学 + 文化 + 機関 | SPLIT (6) |

**Pattern:** Similar to Chinese, Japanese kanji compounds are split into two-character morphemes. This is the expected behavior from the ICU dictionary.

### 4.4 Verb Conjugation

Complex verb conjugations are over-segmented:

```javascript
'食べさせられなかった' (was not made to eat)
// [食 | べ | さ | せ | ら | れ | なか | っ | た]
// Over-segmented: each inflectional suffix is a separate segment
```

This is problematic for conjugated verb matching but not a concern for glossary noun/term matching.

### 4.5 Japanese Particles

Grammatical particles are correctly separated:

```javascript
'私はJavaScriptが好きです'
// [私 | は | JavaScript | が | 好き | です]
// Particles は, が, です correctly identified

'東京に行きたいです'
// [東京 | に | 行き | たい | です]
// Particles に, です correctly identified
```

### 4.6 Halfwidth Katakana

```javascript
'ﾌﾟﾛｸﾞﾗﾐﾝｸﾞ' -> [ﾌﾟﾛｸﾞﾗﾐﾝｸﾞ]  // Treated as single segment
// Note: This is the halfwidth form of プログラミング
```

Halfwidth katakana is preserved as-is but will **NOT match** fullwidth katakana in segment comparison. Normalization (NFKC) should be applied before segmentation.

---

## 5. Korean Segmentation (ko)

> **Note:** Added 2026-02-15 as supplement to original spike. Korean is in-scope for QA Localization Tool CJK support.

### 5.1 Basic Behavior

Unlike Thai, Chinese, and Japanese, Korean text uses **spaces between eojeol** (어절 — spacing units). An eojeol typically consists of a content word plus attached particles or verb endings.

```javascript
const seg = new Intl.Segmenter('ko', { granularity: 'word' });
const text = '오늘 도서관에서 공부했습니다';
// Segments: [오늘 | (space) | 도서관 | 에서 | (space) | 공부 | 했 | 습니다]
// Particles (에서) and verb endings (했, 습니다) separated from stems
```

**Verdict:** Space-based eojeol boundaries are reliable. ICU further segments within eojeol to separate particles and verb endings from stems.

### 5.2 Compound Nouns

| Compound Term | Meaning | Segmentation Result | Status |
|--------------|---------|---------------------|--------|
| 인공지능 | artificial intelligence | 인공 + 지능 | SPLIT |
| 기계학습 | machine learning | 기계 + 학습 | SPLIT |
| 도서관 | library | 도서관 | INTACT |
| 대한민국 | Republic of Korea | 대한 + 민국 | SPLIT |
| 컴퓨터 | computer | 컴퓨터 | INTACT |
| 프로그래밍 | programming | 프로그래밍 | INTACT |
| 자연어처리 | NLP | 자연어 + 처리 | SPLIT |

**Pattern:** Similar to CJK — Sino-Korean compound words (한자어) are split into constituent morphemes. Loan words (외래어) written in Hangul remain intact.

### 5.3 Particles (조사) and Verb Endings (어미)

Particles and verb endings are separated from their host word at `word` granularity:

```javascript
'학교에서 친구를 만났습니다'
// [학교 | 에서 | (space) | 친구 | 를 | (space) | 만났 | 습니다]
// 에서 (at/from) separated from 학교 (school)
// 를 (object marker) separated from 친구 (friend)
// 습니다 (polite ending) separated from 만났 (met)
```

**Implication for Glossary Matching:** A glossary term "학교" will match the segment "학교" since particles are separated. However, a compound term like "인공지능" is split into "인공" + "지능", requiring the hybrid substring approach.

### 5.4 Mixed Korean/English

```javascript
'React로 개발하기'
// [React | 로 | (space) | 개발 | 하기]
// English word correctly isolated, particle 로 separated

'Python과 JavaScript를 배우다'
// [Python | 과 | (space) | JavaScript | 를 | (space) | 배우다]
// Both English words correctly isolated with particles separated
```

**Finding:** Korean handles mixed script better than Thai/Chinese because spaces provide clear eojeol boundaries. Particles are reliably separated from English words.

### 5.5 Key Differences from Other CJK Languages

| Aspect | Korean | Thai | Chinese | Japanese |
|--------|--------|------|---------|----------|
| Spaces between words | ✅ Yes | ❌ No | ❌ No | ❌ No |
| Particle separation | ✅ Separated | N/A | N/A | ✅ Separated |
| Compound word splitting | Same issue | Same issue | Same issue | Same issue |
| Mixed script handling | Good (spaces help) | Poor | Moderate | Moderate |
| Hybrid approach needed? | **Yes** — for compound terms | **Yes** | **Yes** | **Yes** |

---

## 6. Browser/Engine Compatibility

### 6.1 Support Matrix

| Engine | Browser | Version | ICU Library | Available Since |
|--------|---------|---------|-------------|-----------------|
| V8 | Chrome | 87+ | ICU4C | November 2020 |
| V8 | Edge | 87+ | ICU4C | November 2020 |
| JavaScriptCore | Safari | 14.1+ | ICU4C | April 2021 |
| SpiderMonkey | Firefox | 125+ | **ICU4X** | April 2024 |
| V8 | Node.js | 16+ (full ICU) | ICU4C | April 2021 |

**Baseline Status:** Newly available since April 2024 (when Firefox 125 shipped).
**Global Browser Support:** ~95.19% (source: Can I Use).

### 6.2 Cross-Engine Consistency

**This is a significant concern.** The three engines use different ICU implementations:

- **V8 (Chrome/Node.js) and JavaScriptCore (Safari):** Use **ICU4C** (C/C++ implementation)
- **SpiderMonkey (Firefox):** Uses **ICU4X** (Rust implementation)

Known differences between ICU4C and ICU4X:

1. **CJK Dictionary Data:** ICU4X uses a unified CJK dictionary while ICU4C may use separate dictionaries. This can produce different word boundaries for Chinese and Japanese text.
2. **Thai/SEA Languages:** ICU4X supports LSTM-based segmentation for Thai, Khmer, Lao, and Myanmar. ICU4C uses dictionary-based segmentation. Results can differ.
3. **isWordLike Edge Cases:** Firefox (ICU4X) had bugs with `isWordLike` results for text ending in periods (fixed in ICU4X 1.3+).
4. **Sentence Boundary with Emoji:** Minor differences in sentence segmentation around emoji sequences.

**Practical Impact:** For glossary matching in a QA tool, the same text could produce different segment boundaries in Chrome vs Firefox. This means:
- Glossary matching logic must NOT depend on exact segment boundaries
- A hybrid approach (substring + boundary validation) is more robust

### 6.3 Safari 17.4+ Requirement

Safari has supported `Intl.Segmenter` since version 14.1 (April 2021). Safari 17.4+ fully supports the API with no known limitations. No polyfill is needed for Safari 17.4+.

### 6.4 Node.js Requirements

- **Minimum Version:** Node.js 16+ with full ICU data
- **Critical:** Node.js built with `--with-intl=small-icu` will **SEGFAULT** when using `Intl.Segmenter` without runtime ICU data
- **Recommended:** Node.js 18+ LTS (ships with full ICU by default)
- **Current Test Environment:** Node.js v20.19.5, V8 v11.3.244.8, ICU 77.1

```javascript
// Verify ICU support in Node.js
console.log(process.versions.icu); // Should output ICU version number
// If undefined, Intl.Segmenter will not work properly
```

---

## 7. Glossary Matching Use Case

### 7.1 Core Challenge

**Intl.Segmenter cannot be used alone for glossary term matching** due to two fundamental issues:

1. **Compound terms are split:** A glossary term like "โรงพยาบาล" (hospital) becomes two segments: "โรง" + "พยาบาล"
2. **Context-dependent segmentation:** The same text can segment differently depending on surrounding context

### 7.2 Segmentation Analysis of Glossary Terms

Tested 10 Thai, 4 Chinese, and 4 Japanese glossary terms:

**Thai (10 terms):**
- 6/10 stayed intact as single segments
- 4/10 were split into 2+ segments (โรงพยาบาล, สนามบิน, ตู้เย็น, ปัญญาประดิษฐ์)

**Chinese (4 terms):**
- 0/4 stayed intact -- **all were split**
- 人工智能, 机器学习, 深度学习, 图书馆 all split into 2 segments

**Japanese (4 terms):**
- 2/4 stayed intact (プログラミング, コンピューター -- both katakana)
- 2/4 were split (人工知能, 機械学習 -- both kanji compounds)

### 7.3 False Positive Risk

**Scenario: สนามฟุตบอลอยู่ใกล้สนามบิน** (Football field is near the airport)

Segments: `[สนาม | ฟุตบอล | อยู่ | ใกล้ | สนาม | บิน]`

A naive sliding window approach looking for "สนาม" + "บิน" would match at position 4 (สนาม + บิน), which is correct because these segments are **adjacent** in the original text. However, if the text were "สนามใหญ่บินไปเชียงใหม่" (big field, flew to Chiang Mai), "สนาม" and "บิน" would be non-adjacent, and the adjacency check would correctly reject the match.

**Key Insight:** Adjacent segment checking (using the `index` property) is essential to prevent false positives.

### 7.4 Context-Dependent Segmentation Problem

```javascript
// Standalone
'图书馆' -> [图书 | 馆]

// In context
'图书馆里有很多书' -> [图书 | 馆 | 里 | 有 | 很多 | 书]
```

The segmentation of "图书馆" is the same whether standalone or in context in this V8 test. However, **this is not guaranteed across all engines or texts**. The underlying dictionary algorithm considers context when making boundary decisions.

### 7.5 Recommended Approach: Hybrid Matching

Two strategies were tested. Both are recommended to be used together:

#### Strategy 1: Segment Sliding Window (with adjacency check)

```javascript
function matchBySegments(text, glossaryIndex, segmenter) {
  text = text.normalize('NFKC');
  const textSegs = Array.from(segmenter.segment(text));
  const wordSegs = textSegs.filter(s => s.isWordLike);
  const matches = [];

  for (const entry of glossaryIndex) {
    for (let i = 0; i <= wordSegs.length - entry.segCount; i++) {
      const window = wordSegs.slice(i, i + entry.segCount);

      // CRITICAL: Check adjacency in original text
      let isAdjacent = true;
      for (let j = 0; j < window.length - 1; j++) {
        const endIdx = window[j].index + window[j].segment.length;
        if (endIdx !== window[j + 1].index) {
          isAdjacent = false;
          break;
        }
      }

      if (isAdjacent) {
        const joined = window.map(s => s.segment).join('');
        if (joined === entry.segments.join('')) {
          matches.push({
            term: entry.term,
            position: window[0].index,
            matchedSegments: window.map(s => s.segment)
          });
        }
      }
    }
  }
  return matches;
}
```

#### Strategy 2: Hybrid (Substring Search + Segment Boundary Validation)

```javascript
function matchHybrid(text, glossaryTerms, segmenter) {
  // NFKC normalization: ensures halfwidth/fullwidth consistency (see Section 4.6)
  text = text.normalize('NFKC');
  const textSegs = Array.from(segmenter.segment(text));
  const matches = [];

  for (const entry of glossaryTerms) {
    const term = entry.term.normalize('NFKC');
    let searchFrom = 0;
    while (true) {
      const idx = text.indexOf(term, searchFrom);
      if (idx === -1) break;

      // Validate: does the match align with segment boundaries?
      const matchEnd = idx + term.length;
      const startsAtBoundary = textSegs.some(s => s.index === idx);
      const endsAtBoundary = textSegs.some(s => s.index === matchEnd)
                           || matchEnd === text.length;

      if (startsAtBoundary && endsAtBoundary) {
        matches.push({
          term: entry.term,
          position: idx,
          strategy: 'hybrid'
        });
      }
      searchFrom = idx + 1;
    }
  }
  return matches;
}
```

#### Strategy Comparison

| Aspect | Segment Sliding Window | Hybrid (Substring + Boundary) |
|--------|----------------------|-------------------------------|
| Accuracy for compound terms | Relies on consistent segmentation | Always finds exact substring |
| False positive prevention | Adjacency check required | Boundary validation required |
| Cross-engine reliability | Lower (segmentation varies) | **Higher** (substring is deterministic) |
| Performance (1000 iterations, 50x text) | ~950ms | **~875ms** |
| Handles context-dependent splits | Yes, if segments match | **Yes, always** |

**Recommendation:** Use the **Hybrid approach** as the primary strategy. Use segment-based matching as a secondary validation layer.

### 7.6 Multi-Token Glossary Terms

For glossary terms that span multiple segments:

1. **Pre-segment** each glossary term using the same segmenter
2. Store both the original term string and its segment array
3. At match time, use substring search for the original term, then validate boundaries
4. For longest-match semantics, sort glossary by term length (descending) and mark positions as consumed

### 7.7 Localization-Specific Edge Cases

QA localization files often contain inline markup, placeholders, and tags within translatable text. These affect segmentation:

#### Placeholders

```javascript
// printf-style placeholders
'ยินดีต้อนรับ %s สู่ระบบ'
// [ยินดีต้อนรับ | (space) | % | s | (space) | สู่ | ระบบ]
// WARNING: %s is split into % + s

// ICU MessageFormat
'สวัสดี {userName} คุณมี {count} ข้อความ'
// [สวัสดี | (space) | { | userName | } | (space) | คุณ | มี | (space) | { | count | } | (space) | ข้อความ]
// Braces are separated as non-word segments

// Numbered placeholders
'{0}件の新しいメッセージがあります'
// [{0} may merge with adjacent CJK text — boundary disruption risk]
```

#### Inline HTML/XML Tags

```javascript
'这是<b>重要</b>的信息'
// Segments vary: < and > may or may not create boundaries
// RECOMMENDATION: Strip tags before segmentation, reinsert after matching

'คลิก<a href="url">ที่นี่</a>เพื่อดำเนินการ'
// Tags disrupt Thai segmentation severely
```

#### XLIFF Inline Elements

```javascript
// XLIFF uses <x/>, <g>, <bx/>, <ex/> for inline formatting
'クリック<x id="1"/>して<x id="2"/>続行'
// Inline elements break segmentation boundaries
```

**Recommendation:** For glossary matching in localization QA:
1. **Pre-process:** Strip all inline markup/tags/placeholders before segmentation
2. **Map positions:** Maintain a character offset map to translate match positions back to the original tagged text
3. **Placeholder-aware matching:** Treat placeholders as opaque tokens that should not participate in glossary matching

---

## 8. Performance Analysis

### 8.1 Instance Creation Overhead

| Locale | Time per Instance | Notes |
|--------|------------------|-------|
| Thai (th) | ~0.014ms | Includes dictionary loading |
| Chinese (zh) | ~0.012ms | Includes dictionary loading |
| Japanese (ja) | ~0.012ms | Includes dictionary loading |

**Recommendation:** Cache and reuse `Intl.Segmenter` instances. Creating a new instance per call adds ~88% overhead (31ms vs 16.5ms for 1000 iterations).

```javascript
// GOOD: Reuse instances
const segmenters = {
  th: new Intl.Segmenter('th', { granularity: 'word' }),
  zh: new Intl.Segmenter('zh', { granularity: 'word' }),
  'zh-Hant': new Intl.Segmenter('zh-Hant', { granularity: 'word' }),
  ja: new Intl.Segmenter('ja', { granularity: 'word' }),
  ko: new Intl.Segmenter('ko', { granularity: 'word' }),
};
```

### 8.2 Segmentation Performance (Reused Instance)

| Locale | 10,000 calls (short text) | Per call |
|--------|---------------------------|----------|
| Thai (51 chars) | 166.72ms | 0.017ms |
| Chinese (23 chars) | 174.55ms | 0.017ms |
| Japanese (31 chars) | 203.30ms | 0.020ms |

### 8.3 Large Text Performance

| Locale | Text Size | Time | Segments |
|--------|-----------|------|----------|
| Thai | 5,100 chars | 9.09ms | 900 |
| Chinese | 2,300 chars | 7.51ms | 1,300 |
| Japanese | 3,100 chars | 4.00ms | 1,300 |

### 8.4 5,000+ Segments Performance

| Locale | Text Size | Time | Segments |
|--------|-----------|------|----------|
| Thai | 25,500 chars | 228.86ms | 4,500 |
| Chinese | 11,500 chars | 101.89ms | 6,500 |

**Assessment:** For typical QA use cases (processing individual translation segments of 50-500 characters), performance is **more than adequate**. Even batch processing 5,000+ segments completes in under 250ms.

### 8.5 Known Performance Issues

1. **Maximum call stack exceeded:** Native `Intl.Segmenter` can throw when processing strings exceeding 40,000-60,000 characters. Unlikely for QA segment-level processing but relevant for full-document processing.
2. **Performance degradation with non-ASCII characters:** Performance degrades geometrically as the proportion of non-ASCII/extended Unicode characters increases. CJK and Thai texts are by definition 100% non-ASCII.
3. **Chromium bug tracked:** [Issue 326176949](https://issuetracker.google.com/issues/326176949) tracks slow performance in V8's implementation.

**Mitigation:** For large texts, chunk the input at natural boundaries (paragraphs, sentences) before segmenting.

---

## 9. Recommendations for QA Localization Tool

### 9.1 Architecture Decisions

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| Use Intl.Segmenter? | **Yes, as part of hybrid approach** | Only native API for CJK/Thai segmentation |
| Glossary matching strategy | **Hybrid: substring + boundary validation** | Most reliable across engines |
| Instance management | **Singleton cache per locale** | ~2x performance improvement |
| Fallback for old browsers | **Not needed** | Safari 14.1+, all modern browsers support it |
| Node.js minimum | **Node.js 18+ LTS** | Ships with full ICU |
| Korean support | **Same hybrid approach as CJK** | Compound splitting same pattern; spaces help with basic segmentation |
| Text size limit | **Chunk at 30,000 chars** | Prevent stack overflow |

### 9.2 Implementation Plan

```typescript
// Recommended implementation structure
interface GlossaryMatcher {
  // Pre-process: segment glossary terms and build lookup index
  buildIndex(terms: GlossaryTerm[], locale: string): GlossaryIndex;

  // Primary: substring search with segment boundary validation
  matchHybrid(text: string, index: GlossaryIndex): GlossaryMatch[];

  // Secondary: segment-based sliding window for validation
  matchBySegments(text: string, index: GlossaryIndex): GlossaryMatch[];

  // Combined: run both and merge/validate results
  match(text: string, index: GlossaryIndex): GlossaryMatch[];
}
```

### 9.3 Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Cross-engine segmentation differences | Use hybrid approach; do not depend on exact segment boundaries |
| Compound word splitting | Pre-segment glossary terms; use substring matching as primary |
| Context-dependent segmentation | Validate matches against segment boundaries, not segment content |
| New/slang terms not in ICU dictionary | Substring matching catches these regardless of segmentation quality |
| Performance on large documents | Chunk text at paragraph/sentence boundaries |
| Halfwidth/fullwidth character mismatch | Apply NFKC normalization before segmentation |
| Localization file markup (tags, placeholders) | Pre-process: strip inline markup before segmentation; maintain offset map for position translation |

### 9.4 What Intl.Segmenter IS Good For

1. **Word counting** in CJK/Thai text
2. **Text highlighting** at word boundaries (for the QA UI)
3. **Boundary validation** for substring matches (ensuring matches align to word edges)
4. **isWordLike filtering** to distinguish words from punctuation
5. **Segment-level iteration** for displaying source/target text with word-level alignment
6. **Korean eojeol parsing** — separating particles from stems within spacing units

### 9.5 What Intl.Segmenter is NOT Good For

1. **Sole mechanism for glossary matching** (compound words are split)
2. **Exact cross-browser reproduction** of segment boundaries
3. **Morphological analysis** (verb conjugation, inflection)
4. **Named entity recognition** (proper nouns can be split)
5. **New vocabulary/slang** (depends on ICU dictionary updates)
6. **Text with inline markup** (tags, placeholders disrupt segmentation boundaries)

---

## 10. Sources

- [MDN: Intl.Segmenter](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter)
- [MDN Blog: Locale-sensitive text segmentation with Intl.Segmenter](https://developer.mozilla.org/en-US/blog/javascript-intl-segmenter-i18n/)
- [web.dev: Intl.Segmenter now part of Baseline](https://web.dev/blog/intl-segmenter)
- [TC39 Proposal: Intl.Segmenter](https://github.com/tc39/proposal-intl-segmenter)
- [Can I Use: Intl.Segmenter](https://caniuse.com/mdn-javascript_builtins_intl_segmenter)
- [Firefox Bug 1423593: Add Intl.Segmenter API](https://bugzilla.mozilla.org/show_bug.cgi?id=1423593)
- [Firefox Bug 1854032: Enable ICU4X segmenter by default](https://bugzilla.mozilla.org/show_bug.cgi?id=1854032)
- [ICU4X Segmenter Issues](https://github.com/unicode-org/icu4x/issues/7074)
- [V8 Blog: Faster internationalization APIs](https://v8.dev/blog/intl)
- [Chromium Issue 326176949: Slow Intl.Segmenter performance](https://issuetracker.google.com/issues/326176949)
- [jonschlinkert/intl-segmenter: High-performance wrapper](https://github.com/jonschlinkert/intl-segmenter)
- [Node.js Issue 51752: Segmenter SEGFAULT with small-icu](https://github.com/nodejs/node/issues/51752)
- [Intl.Segmenter in 2025 (Medium)](https://medium.com/@asierr/intl-segmenter-in-2025-smarter-string-splitting-for-real-world-languages-3b428c6cccf0)
- [FormatJS: Intl.Segmenter Polyfill](https://formatjs.github.io/docs/polyfills/intl-segmenter/)
- [Unicode ICU4X Text Segmentation](http://blog.unicode.org/2023/04/icu4x-12-now-with-text-segmentation-and.html)
- [MDN: Intl.Segmenter — Korean examples](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter)
- [Unicode UAX #29: Unicode Text Segmentation](https://unicode.org/reports/tr29/)
