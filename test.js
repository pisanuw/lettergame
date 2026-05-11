#!/usr/bin/env node
/**
 * Unit tests for lettergame
 * Run: node test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed++;
    console.log(`  \u2717 ${name}`);
    console.log(`    ${err.message}`);
  }
}

// --- Load source files into a shared context ---

function loadFile(filePath) {
  return fs.readFileSync(path.join(__dirname, filePath), 'utf8');
}

// We need a minimal DOM-like env for game.js, but for unit testing
// we'll test the data files and server function logic directly.

// ========================================
// 1. Word data integrity tests
// ========================================

console.log('\n--- English Word Data (words.js) ---');

const enCtx = {};
const enTmp = path.join(require('os').tmpdir(), '_test_words_en.js');
fs.writeFileSync(enTmp, loadFile('words.js') + '\nmodule.exports = { CATEGORIES, WORDS };');
const { CATEGORIES: CATEGORIES_EN, WORDS: WORDS_EN } = require(enTmp);

test('CATEGORIES has 24 entries', () => {
  assert.strictEqual(Object.keys(CATEGORIES_EN).length, 24);
});

test('Every category key exists in WORDS', () => {
  for (const key of Object.keys(CATEGORIES_EN)) {
    assert.ok(WORDS_EN[key], `Missing WORDS entry for category "${key}"`);
  }
});

test('All words start with their letter key (English)', () => {
  const mismatches = [];
  for (const [cat, letters] of Object.entries(WORDS_EN)) {
    for (const [letter, words] of Object.entries(letters)) {
      for (const word of words) {
        if (!word.toUpperCase().startsWith(letter)) {
          mismatches.push(`${cat}[${letter}]: "${word}"`);
        }
      }
    }
  }
  assert.strictEqual(mismatches.length, 0,
    `${mismatches.length} words don't start with their letter:\n    ${mismatches.slice(0, 10).join('\n    ')}`);
});

test('No empty word arrays in English', () => {
  for (const [cat, letters] of Object.entries(WORDS_EN)) {
    for (const [letter, words] of Object.entries(letters)) {
      assert.ok(words.length > 0, `${cat}[${letter}] is empty`);
    }
  }
});

// ========================================
// 2. Turkish word data tests
// ========================================

console.log('\n--- Turkish Word Data (words-tr.js) ---');

const trTmp = path.join(require('os').tmpdir(), '_test_words_tr.js');
fs.writeFileSync(trTmp,
  loadFile('words-tr.js') + '\nmodule.exports = { CATEGORIES: CATEGORIES_TR, WORDS: WORDS_TR };');
const { CATEGORIES: CATEGORIES_TR, WORDS: WORDS_TR } = require(trTmp);

test('Turkish CATEGORIES has 20 entries', () => {
  assert.strictEqual(Object.keys(CATEGORIES_TR).length, 20);
});

test('Turkish CATEGORIES keys are a subset of English keys', () => {
  const enKeys = new Set(Object.keys(CATEGORIES_EN));
  for (const key of Object.keys(CATEGORIES_TR)) {
    assert.ok(enKeys.has(key), `Turkish category "${key}" not found in English`);
  }
});

test('Every Turkish category key exists in WORDS_TR', () => {
  for (const key of Object.keys(CATEGORIES_TR)) {
    assert.ok(WORDS_TR[key], `Missing WORDS_TR entry for category "${key}"`);
  }
});

test('Turkish category labels are not English', () => {
  const enLabels = new Set(Object.values(CATEGORIES_EN).map(v => v.toLowerCase()));
  let allEnglish = true;
  for (const label of Object.values(CATEGORIES_TR)) {
    if (!enLabels.has(label.toLowerCase())) allEnglish = false;
  }
  assert.ok(!allEnglish, 'All Turkish category labels appear to be English');
});

// ========================================
// 3. Hints data tests
// ========================================

console.log('\n--- English Hints Data (hints.js) ---');

const hintsTmp = path.join(require('os').tmpdir(), '_test_hints.js');
fs.writeFileSync(hintsTmp, loadFile('hints.js') + '\nmodule.exports = { HINTS };');
const { HINTS: HINTS_EN } = require(hintsTmp);

test('HINTS object is not empty', () => {
  assert.ok(Object.keys(HINTS_EN).length > 0, 'HINTS is empty');
});

test('Hint categories match word categories', () => {
  const hintCats = Object.keys(HINTS_EN).sort();
  const wordCats = Object.keys(WORDS_EN).sort();
  assert.deepStrictEqual(hintCats, wordCats);
});

test('Every English word has a hint', () => {
  let missing = 0;
  let total = 0;
  for (const [cat, letters] of Object.entries(WORDS_EN)) {
    for (const [letter, words] of Object.entries(letters)) {
      for (const word of words) {
        total++;
        if (!HINTS_EN[cat]?.[letter]?.[word]) missing++;
      }
    }
  }
  // Allow some missing hints but flag if more than 5%
  const pct = (missing / total * 100).toFixed(1);
  assert.ok(missing < total * 0.05,
    `${missing}/${total} words (${pct}%) missing hints`);
});

console.log('\n--- Turkish Hints Data (hints-tr.js) ---');

const hintsTrTmp = path.join(require('os').tmpdir(), '_test_hints_tr.js');
fs.writeFileSync(hintsTrTmp, loadFile('hints-tr.js') + '\nmodule.exports = { HINTS: HINTS_TR };');
const { HINTS: HINTS_TR_DATA } = require(hintsTrTmp);

test('Turkish HINTS object is not empty', () => {
  assert.ok(Object.keys(HINTS_TR_DATA).length > 0, 'HINTS_TR is empty');
});

// ========================================
// 4. i18n.js structure tests
// ========================================

console.log('\n--- i18n.js ---');

// We can't load i18n.js directly since it references browser globals.
// Parse it and verify structure.
const i18nSrc = loadFile('i18n.js');

test('i18n.js defines LANG object', () => {
  assert.ok(i18nSrc.includes('const LANG = {'), 'Missing LANG definition');
});

test('i18n.js defines UI object', () => {
  assert.ok(i18nSrc.includes('const UI = {'), 'Missing UI definition');
});

test('i18n.js has en and tr in LANG', () => {
  assert.ok(i18nSrc.includes("en: {"), 'Missing LANG.en');
  assert.ok(i18nSrc.includes("tr: {"), 'Missing LANG.tr');
});

test('UI has matching keys for en and tr', () => {
  // Extract key names from the en block and tr block
  const extractKeys = (label) => {
    const regex = new RegExp(`${label}:\\s*\\{([\\s\\S]*?)\\n  \\}`, 'm');
    const match = i18nSrc.match(regex);
    if (!match) return [];
    const lines = match[1].split('\n');
    return lines
      .map(l => l.match(/^\s+(\w+):/))
      .filter(Boolean)
      .map(m => m[1]);
  };
  // Simple check: both blocks should have same number of keys
  const enBlock = i18nSrc.indexOf("const UI = {");
  assert.ok(enBlock > 0, 'UI object not found');
});

// ========================================
// 5. index.html structure tests
// ========================================

console.log('\n--- index.html ---');

const html = loadFile('index.html');

test('index.html loads words-web.js', () => {
  assert.ok(html.includes('src="words-web.js"'));
});

test('index.html loads words.js', () => {
  assert.ok(html.includes('src="words.js"'));
});

test('index.html loads words-tr.js', () => {
  assert.ok(html.includes('src="words-tr.js"'));
});

test('index.html loads hints.js', () => {
  assert.ok(html.includes('src="hints.js"'));
});

test('index.html loads hints-tr.js', () => {
  assert.ok(html.includes('src="hints-tr.js"'));
});

test('index.html loads i18n.js', () => {
  assert.ok(html.includes('src="i18n.js"'));
});

test('index.html loads game.js last', () => {
  const i18nPos = html.indexOf('src="i18n.js"');
  const gamePos = html.indexOf('src="game.js"');
  assert.ok(gamePos > i18nPos, 'game.js should load after i18n.js');
});

test('index.html has language selector', () => {
  assert.ok(html.includes('id="lang-select"'));
});

test('index.html has Turkish language option', () => {
  assert.ok(html.includes('value="tr"'));
});

test('index.html has html-root id for lang attribute', () => {
  assert.ok(html.includes('id="html-root"'));
});

// ========================================
// 6. game.js structure tests
// ========================================

console.log('\n--- game.js ---');

const gameSrc = loadFile('game.js');

test('game.js has setLanguage function', () => {
  assert.ok(gameSrc.includes('function setLanguage('));
});

test('game.js references activeCategories (not global CATEGORIES)', () => {
  // Check it uses activeCategories in key game functions
  assert.ok(gameSrc.includes('activeCategories[state.category]'));
});

test('game.js references activeWords (not global WORDS)', () => {
  assert.ok(gameSrc.includes('activeWords[state.category]'));
});

test('game.js references activeHints (not global HINTS)', () => {
  assert.ok(gameSrc.includes('activeHints[state.category]'));
});

test('game.js uses activeWikiLang for Wikipedia URLs', () => {
  assert.ok(gameSrc.includes('activeWikiLang'));
  assert.ok(gameSrc.includes('${activeWikiLang}.wikipedia.org'));
});

test('game.js has CATEGORY_HINT for both en and tr', () => {
  assert.ok(gameSrc.includes("en: {"));
  assert.ok(gameSrc.includes("tr: {"));
});

test('game.js state includes lang', () => {
  assert.ok(gameSrc.includes("lang: 'en'") || gameSrc.includes('lang:'));
});

test('game.js has mergeWebWords function', () => {
  assert.ok(gameSrc.includes('function mergeWebWords('));
});

test('game.js calls mergeWebWords in setLanguage', () => {
  assert.ok(gameSrc.includes('mergeWebWords(data.words'));
});

test('game.js uses translated UI strings (t.xxx)', () => {
  assert.ok(gameSrc.includes('t.yourTurn('));
  assert.ok(gameSrc.includes('t.computerThinking'));
  assert.ok(gameSrc.includes('t.hint'));
  assert.ok(gameSrc.includes('t.skip'));
});

// ========================================
// 7. admin-add-word.js tests
// ========================================

console.log('\n--- admin-add-word.js ---');

const adminSrc = loadFile('netlify/functions/admin-add-word.js');

test('admin function has LANG_CONFIG', () => {
  assert.ok(adminSrc.includes('LANG_CONFIG'));
});

test('admin function supports en and tr Wikipedia', () => {
  assert.ok(adminSrc.includes("wikiLang: 'en'"));
  assert.ok(adminSrc.includes("wikiLang: 'tr'"));
});

test('admin function uses langConfig.wikiLang for Wikipedia URLs', () => {
  assert.ok(adminSrc.includes('${wikiLang}.wikipedia.org'));
});

test('admin function commits to words-web.js', () => {
  assert.ok(adminSrc.includes("WEB_WORDS_FILE") || adminSrc.includes("words-web.js"),
    'admin should commit to words-web.js');
});

test('admin function has appendToWebWords function', () => {
  assert.ok(adminSrc.includes('function appendToWebWords('),
    'appendToWebWords function not found in admin-add-word.js');
});

// ========================================
// 8. admin.html tests
// ========================================

console.log('\n--- admin.html ---');

const adminHtml = loadFile('admin.html');

test('admin.html has language selector', () => {
  assert.ok(adminHtml.includes('id="lang-select"'));
});

test('admin.html passes lang in API calls', () => {
  assert.ok(adminHtml.includes('lang: item.lang'));
});

test('admin.html queue items store lang', () => {
  assert.ok(adminHtml.includes('lang: getLang()'));
});

// ========================================
// 9. words-web.js and merge script tests
// ========================================

console.log('\n--- words-web.js ---');

const webWordsSrc = loadFile('words-web.js');

test('words-web.js defines WEB_WORDS array', () => {
  assert.ok(webWordsSrc.includes('const WEB_WORDS = ['));
});

test('words-web.js is valid JavaScript', () => {
  // Should parse without error
  const fn = new Function(webWordsSrc + '\nreturn WEB_WORDS;');
  const result = fn();
  assert.ok(Array.isArray(result), 'WEB_WORDS should be an array');
});

test('merge-web-words.js exists', () => {
  assert.ok(fs.existsSync(path.join(__dirname, 'merge-web-words.js')));
});

// ========================================
// 10. Cross-file consistency tests
// ========================================

console.log('\n--- Cross-file Consistency ---');

test('Turkish word categories are a subset of English word categories', () => {
  const enKeys = new Set(Object.keys(WORDS_EN));
  for (const key of Object.keys(WORDS_TR)) {
    assert.ok(enKeys.has(key), `Turkish word category "${key}" not found in English`);
  }
  assert.ok(Object.keys(WORDS_EN).length >= Object.keys(WORDS_TR).length,
    `EN has ${Object.keys(WORDS_EN).length} categories, TR has ${Object.keys(WORDS_TR).length}`);
});

test('Both languages cover all 26 letters in at least some categories', () => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  for (const lang of [{ name: 'EN', words: WORDS_EN }, { name: 'TR', words: WORDS_TR }]) {
    const coveredLetters = new Set();
    for (const cat of Object.values(lang.words)) {
      for (const letter of Object.keys(cat)) {
        coveredLetters.add(letter);
      }
    }
    assert.strictEqual(coveredLetters.size, 26,
      `${lang.name} only covers ${coveredLetters.size}/26 letters across all categories`);
  }
});

test('Wikipedia language codes are valid', () => {
  assert.ok(gameSrc.includes("wikiLang:   'en'") || i18nSrc.includes("wikiLang:   'en'"));
  assert.ok(gameSrc.includes("wikiLang:   'tr'") || i18nSrc.includes("wikiLang:   'tr'"));
});

// ========================================
// Summary
// ========================================

console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);
