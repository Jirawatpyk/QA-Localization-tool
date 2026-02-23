const texts = {
  english: [
    // Basic
    { text: 'Hello world', locale: 'en-US' },
    { text: 'The quick brown fox jumps over the lazy dog', locale: 'en-US' },
    { text: 'Single', locale: 'en-US' },
    { text: 'One two three four five', locale: 'en-US' },
    // Punctuation (space-split should not count punctuation as words)
    { text: 'Hello, world!', locale: 'en-US' },
    { text: 'Error: file not found.', locale: 'en-US' },
    // Hyphenated / contractions
    { text: "It's a well-known issue", locale: 'en-US' },
    // Translation-context sentences
    { text: 'Please click the Save button to continue.', locale: 'en-US' },
    { text: 'An error occurred while processing your request.', locale: 'en-US' },
    // Numbers mixed
    { text: 'Version 2.0 is now available', locale: 'en-US' },
  ],
  thai: [
    // Basic (existing)
    { text: 'สวัสดีครับ', locale: 'th-TH' },
    { text: 'ฉันชอบกินข้าวผัด', locale: 'th-TH' },
    { text: 'การแปลภาษาเป็นเรื่องที่ซับซ้อน', locale: 'th-TH' },
    { text: 'ประเทศไทย', locale: 'th-TH' },
    // Thai + English mixed (localization context)
    { text: 'กรุณาคลิกปุ่ม Save เพื่อบันทึก', locale: 'th-TH' },
    { text: 'ไฟล์ XLIFF สำหรับ localization', locale: 'th-TH' },
    // Numbers in Thai
    { text: 'จำนวน 100 คำในเอกสาร', locale: 'th-TH' },
    // With punctuation
    { text: 'เกิดข้อผิดพลาด: ไม่พบไฟล์ที่ระบุ', locale: 'th-TH' },
    // Longer paragraph (typical QA context)
    { text: 'โปรดอ่านข้อความสำคัญนี้ก่อนดำเนินการต่อ', locale: 'th-TH' },
    { text: 'ระบบตรวจสอบคุณภาพการแปลช่วยให้ผู้ตรวจสอบทำงานได้อย่างมีประสิทธิภาพ', locale: 'th-TH' },
    // Single word edge cases
    { text: 'บันทึก', locale: 'th-TH' },
    { text: 'ยกเลิก', locale: 'th-TH' },
  ],
  japanese: [
    // Basic (existing)
    { text: '日本語のテスト', locale: 'ja-JP' },
    { text: '私はプログラマーです', locale: 'ja-JP' },
    { text: 'テスト', locale: 'ja-JP' },
    { text: 'こんにちは世界', locale: 'ja-JP' },
    // Kanji-heavy
    { text: '翻訳品質管理', locale: 'ja-JP' },
    // With English mixed
    { text: 'ファイルをSaveしてください', locale: 'ja-JP' },
    // Numbers
    { text: '100件のエラーが見つかりました', locale: 'ja-JP' },
    // Longer sentence
    { text: 'このファイルは正しい形式ではありません', locale: 'ja-JP' },
    // With punctuation
    { text: 'エラー：ファイルが見つかりません', locale: 'ja-JP' },
    // Single kanji
    { text: '保存', locale: 'ja-JP' },
  ],
  chinese: [
    // Basic (existing)
    { text: '你好世界', locale: 'zh-CN' },
    { text: '我是一个程序员', locale: 'zh-CN' },
    { text: '测试', locale: 'zh-CN' },
    { text: '这是一个简单的句子', locale: 'zh-CN' },
    // With punctuation
    { text: '错误：文件未找到', locale: 'zh-CN' },
    // Longer sentence
    { text: '请在继续之前阅读此重要通知', locale: 'zh-CN' },
    // With numbers
    { text: '共找到100个错误', locale: 'zh-CN' },
    // Translation/localization context
    { text: '翻译质量检查系统', locale: 'zh-CN' },
    // English mixed
    { text: '请点击Save按钮保存文件', locale: 'zh-CN' },
    // Single word
    { text: '保存', locale: 'zh-CN' },
  ],
  korean: [
    // Basic (existing)
    { text: '안녕하세요', locale: 'ko-KR' },
    { text: '나는 프로그래머입니다', locale: 'ko-KR' },
    { text: '테스트', locale: 'ko-KR' },
    { text: '이것은 간단한 문장입니다', locale: 'ko-KR' },
    // With punctuation
    { text: '오류: 파일을 찾을 수 없습니다', locale: 'ko-KR' },
    // Longer sentence
    { text: '계속하기 전에 이 중요한 알림을 읽어주세요', locale: 'ko-KR' },
    // With numbers
    { text: '100개의 오류가 발견되었습니다', locale: 'ko-KR' },
    // English mixed
    { text: 'Save 버튼을 클릭하여 저장하세요', locale: 'ko-KR' },
    // Translation context
    { text: '번역 품질 검사 시스템', locale: 'ko-KR' },
    // Single word
    { text: '저장', locale: 'ko-KR' },
  ],
}

const segmenterCache = new Map()

function getSegmenter(locale) {
  if (!segmenterCache.has(locale)) {
    segmenterCache.set(locale, new Intl.Segmenter(locale, { granularity: 'word' }))
  }
  return segmenterCache.get(locale)
}

const noSpaceLocales = new Set(['th', 'ja', 'zh', 'ko', 'my', 'km', 'lo'])

function countWords(text, locale) {
  const primary = (locale.split('-')[0] || locale).toLowerCase()

  if (noSpaceLocales.has(primary)) {
    const segmenter = getSegmenter(locale)
    let count = 0
    for (const segment of segmenter.segment(text)) {
      if (segment.isWordLike) count++
    }
    return count
  }

  return text.trim().split(/\s+/).filter(Boolean).length
}

const results = {}
for (const [lang, items] of Object.entries(texts)) {
  results[lang] = items.map(({ text, locale }) => ({
    text,
    locale,
    expected_tokens: countWords(text.trim(), locale),
  }))
}

console.log(JSON.stringify(results, null, 2))
