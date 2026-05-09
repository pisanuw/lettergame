#!/usr/bin/env node
/**
 * generate-hints.js
 *
 * One-time script to generate one hint per word for all 2105 words in words.js.
 * Writes output to hints.js.
 *
 * Requirements:
 *   npm install @anthropic-ai/sdk
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *
 * Run:
 *   node generate-hints.js
 *
 * Resumes from existing hints.js if interrupted (skips already-generated words).
 */

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const HINTS_FILE = path.join(__dirname, 'hints.js');
const WORDS_FILE = path.join(__dirname, 'words.js');

// Load WORDS and CATEGORIES from words.js
// const declarations are block-scoped so we write a temp CommonJS wrapper
const os = require('os');
const wordsSource = fs.readFileSync(WORDS_FILE, 'utf8');
const tmpFile = path.join(os.tmpdir(), '_lettergame_words_tmp.js');
fs.writeFileSync(tmpFile, wordsSource + '\nmodule.exports = { CATEGORIES, WORDS };');
const { CATEGORIES, WORDS } = require(tmpFile);

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Load existing hints if file exists (for resume on interruption)
let existingHints = {};
if (fs.existsSync(HINTS_FILE)) {
  const src = fs.readFileSync(HINTS_FILE, 'utf8');
  // Extract the object literal between the first { and the last };
  const match = src.match(/const HINTS = (\{[\s\S]*\});/);
  if (match) {
    try { existingHints = eval('(' + match[1] + ')'); } catch (e) { existingHints = {}; }
  }
  console.log(`Resuming: ${countHints(existingHints)} hints already generated.`);
}

function countHints(h) {
  let n = 0;
  for (const cat of Object.keys(h)) for (const letter of Object.keys(h[cat])) n += Object.keys(h[cat][letter]).length;
  return n;
}

async function generateHint(word, category, categoryLabel) {
  const prompt = `You are writing hints for a word guessing game. The category is "${categoryLabel}".

Generate ONE hint for the word "${word}" that helps a player figure out the word without revealing it directly.

Hint styles to choose from (pick the most natural fit for this word):
- Fill in the blank: e.g. "The ___ is a tropical fruit with spiky skin and yellow flesh." (leave a blank where the word would go)
- Description: e.g. "A large flightless bird native to Australia, known for its speed."
- Sounds like: e.g. "Sounds like a color plus a berry."
- Starts with: e.g. "Starts with the same letters as 'fantastic'." (only use when genuinely helpful)
- Fun fact: e.g. "This fruit contains bromelain, an enzyme that can tenderize meat."
- Origin/history: e.g. "Named after the city where it was first served, in Belgium."

Rules:
- Do NOT include the word itself anywhere in the hint.
- Do NOT say "this word" or "the answer" — write it naturally.
- Keep it under 20 words.
- Return ONLY the hint text, nothing else.`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text.trim();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function writeHintsFile(hints) {
  const lines = ['const HINTS = {'];
  for (const cat of Object.keys(hints)) {
    lines.push(`  ${cat}: {`);
    for (const letter of Object.keys(hints[cat]).sort()) {
      lines.push(`    ${letter}: {`);
      for (const [word, hint] of Object.entries(hints[cat][letter])) {
        const escaped = hint.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        lines.push(`      '${word.replace(/'/g, "\\'")}': '${escaped}',`);
      }
      lines.push(`    },`);
    }
    lines.push(`  },`);
  }
  lines.push('};');
  fs.writeFileSync(HINTS_FILE, lines.join('\n') + '\n');
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable not set.');
    process.exit(1);
  }

  const hints = existingHints;
  let generated = 0;
  let skipped = 0;
  let errors = 0;

  for (const [catKey, catLabel] of Object.entries(CATEGORIES)) {
    hints[catKey] = hints[catKey] || {};
    const catWords = WORDS[catKey];
    if (!catWords) continue;

    for (const [letter, wordList] of Object.entries(catWords)) {
      hints[catKey][letter] = hints[catKey][letter] || {};

      for (const word of wordList) {
        if (hints[catKey][letter][word]) {
          skipped++;
          continue;
        }

        process.stdout.write(`  [${catKey}][${letter}] ${word} ... `);
        try {
          const hint = await generateHint(word, catKey, catLabel);
          hints[catKey][letter][word] = hint;
          console.log(`OK: ${hint}`);
          generated++;

          // Save after every word so we can resume if interrupted
          writeHintsFile(hints);

          // Rate limit: ~3 req/sec to stay within Haiku limits
          await sleep(350);
        } catch (err) {
          console.log(`ERROR: ${err.message}`);
          errors++;
          await sleep(2000);
        }
      }
    }

    console.log(`Done category: ${catLabel}`);
  }

  const total = generated + skipped;
  console.log(`\nComplete. Generated: ${generated}, Skipped (already done): ${skipped}, Errors: ${errors}`);
  console.log(`Total hints in file: ${countHints(hints)} / ${total}`);
}

main().catch(err => { console.error(err); process.exit(1); });
