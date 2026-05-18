#!/usr/bin/env node
/**
 * merge-web-words.js
 *
 * Reads words-web.js, inserts each word into the correct position in
 * words.js (English) or words-tr.js (Turkish), generates hints using
 * the claude CLI (Max subscription), then clears words-web.js back
 * to an empty array.
 *
 * Usage:  node merge-web-words.js
 *   --dry-run   Show what would change without writing files
 *
 * Requires: claude CLI installed (uses your Max subscription, no API cost).
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

const WEB_FILE  = path.join(__dirname, 'words-web.js');
const LANG_FILES = {
  en: path.join(__dirname, 'words.js'),
  tr: path.join(__dirname, 'words-tr.js'),
};
const HINT_FILES = {
  en: path.join(__dirname, 'hints.js'),
  tr: path.join(__dirname, 'hints-tr.js'),
};

// Category display names for hint prompts
const CATEGORY_LABELS = {
  fruits:'Fruits', animals:'Animals', cities:'World Cities', foods:'Foods and Dishes',
  vegetables:'Vegetables', sports:'Sports', instruments:'Musical Instruments',
  occupations:'Occupations', birds:'Birds', flowers:'Flowers', trees:'Trees',
  gemstones:'Gemstones', dinosaurs:'Dinosaurs', movies:'Movies', games:'Video Games',
  tvshows:'TV Shows', superheroes:'Superheroes', mythology:'Mythological Deities',
  history:'Historical Figures', dances:'Dances',
  countries:'Countries', baseball:'Famous Baseball Players',
  football:'Famous Football Players', basketball:'Famous Basketball Players',
};

// ---------- Parse WEB_WORDS from words-web.js ----------

function loadWebWords() {
  const src = fs.readFileSync(WEB_FILE, 'utf8');
  const fn = new Function(src + '\nreturn WEB_WORDS;');
  return fn();
}

// ---------- Insert a word into the correct line of a words file ----------

function insertWord(content, category, word) {
  const letter = word[0].toUpperCase();
  const lines = content.split('\n');
  let inCategory = false;
  let inserted = false;

  const result = lines.map((line) => {
    if (!inCategory) {
      if (line.trim().startsWith(`${category}:`) && line.includes('{')) {
        inCategory = true;
      }
      return line;
    }

    // End of category block
    if (/^\s{2}\},?\s*$/.test(line)) {
      if (!inserted) {
        inserted = true;
        const escaped = word.replace(/'/g, "\\'");
        return `    ${letter}: ['${escaped}'],\n${line}`;
      }
      inCategory = false;
      return line;
    }

    if (!inserted && line.trimStart().startsWith(`${letter}: [`)) {
      const escaped = word.replace(/'/g, "\\'");
      const pattern = new RegExp(`'${escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`, 'i');
      if (pattern.test(line)) {
        inserted = true;
        return line;
      }
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

// ---------- Insert a hint into hints file ----------

function insertHint(content, category, word, hint, letter) {
  const escaped = word.replace(/'/g, "\\'");
  const escapedHint = hint.replace(/'/g, "\\'");
  const entry = `      '${escaped}': '${escapedHint}',`;

  // Check if hint already exists
  if (content.includes(`'${escaped}':`)) {
    return content;
  }

  // Find the category -> letter section and append before its closing },
  // Strategy: find the letter block inside the category, add before its end
  const lines = content.split('\n');
  let inCategory = false;
  let inLetter = false;
  let inserted = false;
  let lastEntryIdx = -1;
  let letterBlockEnd = -1;
  let categoryEnd = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inCategory) {
      if (line.trim().startsWith(`${category}:`) && line.includes('{')) {
        inCategory = true;
      }
      continue;
    }

    // End of category
    if (/^\s{2}\},?\s*$/.test(line) && !inLetter) {
      categoryEnd = i;
      break;
    }

    if (!inLetter) {
      if (line.trim().startsWith(`${letter}: {`) || line.trim() === `${letter}: {`) {
        inLetter = true;
      }
      continue;
    }

    // End of letter block
    if (/^\s{4}\},?\s*$/.test(line)) {
      letterBlockEnd = i;
      break;
    }

    // Track last entry line
    if (line.trim().match(/^'.+'/)) {
      lastEntryIdx = i;
    }
  }

  if (letterBlockEnd > 0) {
    // Insert before the closing }, of the letter block
    lines.splice(letterBlockEnd, 0, entry);
    inserted = true;
  } else if (categoryEnd > 0) {
    // Letter block doesn't exist; create it
    const block = `    ${letter}: {\n${entry}\n    },`;
    lines.splice(categoryEnd, 0, block);
    inserted = true;
  }

  if (!inserted) {
    console.warn(`  WARNING: Could not insert hint for "${word}" in ${category}[${letter}].`);
    return content;
  }

  return lines.join('\n');
}

// ---------- Generate hints using Anthropic API ----------

async function generateHints(words) {
  const { execSync } = require('child_process');

  // Verify claude CLI is available
  try {
    execSync('which claude', { stdio: 'ignore' });
  } catch {
    console.log('\n  claude CLI not found. Install Claude Code or add hints manually.');
    return null;
  }

  // Build prompt
  const items = words.map(w => {
    const catLabel = CATEGORY_LABELS[w.category] || w.category;
    const langLabel = w.lang === 'tr' ? 'Turkish' : 'English';
    return `- "${w.word}" (category: ${catLabel}, language: ${langLabel})`;
  }).join('\n');

  const prompt = `Generate one short hint/clue for each word below. The hint should help someone guess the word without saying it directly. Keep each hint to 1-2 sentences. For Turkish words, write the hint in Turkish.

Words:
${items}

Return ONLY a JSON object mapping each word to its hint string. Example:
{"Apple": "A common red or green fruit that keeps the doctor away.", "Elma": "Kırmızı veya yeşil, doktoru uzak tutan yaygın bir meyve."}`;

  try {
    console.log(`\n  Generating ${words.length} hint(s) via claude CLI (uses Max subscription)...`);
    const result = execSync(`claude -p ${JSON.stringify(prompt)}`, {
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 1024 * 1024,
    });

    const text = result.trim();
    // Extract JSON from response (may be wrapped in ```json blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('  Could not parse hint response. Add hints manually.');
      console.warn('  Raw response:', text.slice(0, 200));
      return null;
    }

    const hints = JSON.parse(jsonMatch[0]);
    console.log(`  Generated ${Object.keys(hints).length} hint(s).`);
    return hints;
  } catch (err) {
    console.warn(`  claude CLI error: ${err.message}. Add hints manually.`);
    return null;
  }
}

// ---------- Main ----------

async function main() {
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

  // Step 1: Insert words into word files
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

  // Step 2: Generate and insert hints
  if (!DRY_RUN) {
    const allWords = webWords.filter(w => LANG_FILES[w.lang || 'en']);
    const hints = await generateHints(allWords);

    if (hints) {
      for (const [lang, entries] of Object.entries(byLang)) {
        const hintPath = HINT_FILES[lang];
        if (!hintPath) continue;

        console.log(`--- hints: ${path.basename(hintPath)} ---`);
        let hintContent = fs.readFileSync(hintPath, 'utf8');

        for (const entry of entries) {
          const hint = hints[entry.word];
          if (!hint) {
            console.warn(`  No hint generated for "${entry.word}". Add manually.`);
            continue;
          }
          const letter = entry.word[0].toUpperCase();
          console.log(`  + ${entry.category}[${letter}]: "${entry.word}" -> "${hint.slice(0, 50)}..."`);
          hintContent = insertHint(hintContent, entry.category, entry.word, hint, letter);
        }

        fs.writeFileSync(hintPath, hintContent, 'utf8');
        console.log(`  Written to ${path.basename(hintPath)}\n`);
      }
    }
  } else {
    console.log('[dry-run] Would generate hints via Anthropic API.\n');
  }

  // Step 3: Clear words-web.js
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
