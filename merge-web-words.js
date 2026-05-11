#!/usr/bin/env node
/**
 * merge-web-words.js
 *
 * Reads words-web.js, inserts each word into the correct position in
 * words.js (English) or words-tr.js (Turkish), then clears words-web.js
 * back to an empty array.
 *
 * Usage:  node merge-web-words.js
 *   --dry-run   Show what would change without writing files
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

const WEB_FILE  = path.join(__dirname, 'words-web.js');
const LANG_FILES = {
  en: path.join(__dirname, 'words.js'),
  tr: path.join(__dirname, 'words-tr.js'),
};

// ---------- Parse WEB_WORDS from words-web.js ----------

function loadWebWords() {
  const src = fs.readFileSync(WEB_FILE, 'utf8');
  // Execute the file in a sandbox to get WEB_WORDS
  const fn = new Function(src + '\nreturn WEB_WORDS;');
  return fn();
}

// ---------- Insert a word into the correct line of a words file ----------

function insertWord(content, category, word) {
  const letter = word[0].toUpperCase();
  const lines = content.split('\n');
  let inCategory = false;
  let inserted = false;
  let letterLineExists = false;

  const result = lines.map((line, idx) => {
    if (!inCategory) {
      if (line.trim().startsWith(`${category}:`) && line.includes('{')) {
        inCategory = true;
      }
      return line;
    }

    // End of category block
    if (/^\s{2}\},?\s*$/.test(line)) {
      // If we never found the letter line, insert a new one before the closing brace
      if (!inserted) {
        inserted = true;
        const escaped = word.replace(/'/g, "\\'");
        return `    ${letter}: ['${escaped}'],\n${line}`;
      }
      inCategory = false;
      return line;
    }

    if (!inserted && line.trimStart().startsWith(`${letter}: [`)) {
      letterLineExists = true;
      // Check for duplicate
      const escaped = word.replace(/'/g, "\\'");
      const pattern = new RegExp(`'${escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`, 'i');
      if (pattern.test(line)) {
        // Already exists, skip
        inserted = true;
        return line;
      }
      // Append word to this array line
      inserted = true;
      const closingMatch = line.match(/(\],?)(\s*)$/);
      if (!closingMatch) return line;
      const closing = closingMatch[1];
      const before = line.slice(0, line.lastIndexOf(closing));
      return `${before}, '${escaped}'${closing}`;
    }

    return line;
  });

  if (!inserted) {
    console.warn(`  WARNING: Could not find category "${category}" in file. Skipping "${word}".`);
    return content;
  }

  return result.join('\n');
}

// ---------- Main ----------

function main() {
  const webWords = loadWebWords();

  if (webWords.length === 0) {
    console.log('words-web.js is empty. Nothing to merge.');
    return;
  }

  console.log(`Found ${webWords.length} word(s) to merge.\n`);

  // Group by language
  const byLang = {};
  for (const entry of webWords) {
    const lang = entry.lang || 'en';
    if (!byLang[lang]) byLang[lang] = [];
    byLang[lang].push(entry);
  }

  for (const [lang, entries] of Object.entries(byLang)) {
    const filePath = LANG_FILES[lang];
    if (!filePath) {
      console.warn(`Unknown language "${lang}". Skipping ${entries.length} word(s).`);
      continue;
    }

    console.log(`--- ${lang} (${path.basename(filePath)}) ---`);
    let content = fs.readFileSync(filePath, 'utf8');

    for (const entry of entries) {
      const letter = entry.word[0].toUpperCase();
      console.log(`  + ${entry.category}[${letter}]: "${entry.word}"`);
      content = insertWord(content, entry.category, entry.word);
    }

    if (!DRY_RUN) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`  Written to ${path.basename(filePath)}\n`);
    } else {
      console.log(`  [dry-run] Would write to ${path.basename(filePath)}\n`);
    }
  }

  // Clear words-web.js
  if (!DRY_RUN) {
    const emptyContent = `// Words added via the admin web interface.
// Format: array of { lang, category, word } objects.
// These are merged into the game at runtime and periodically
// folded into the main word files via merge-web-words.js.
const WEB_WORDS = [];
`;
    fs.writeFileSync(WEB_FILE, emptyContent, 'utf8');
    console.log('Cleared words-web.js.');
    console.log('\nDone! Review changes, then commit.');
  } else {
    console.log('[dry-run] Would clear words-web.js.');
  }
}

main();
