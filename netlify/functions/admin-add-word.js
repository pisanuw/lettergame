/**
 * admin-add-word.js
 *
 * Netlify Function — POST /admin-add-word
 *
 * Body (JSON):
 *   { password, category, word, verify }
 *
 * verify=false  → mode 1: add directly (requires ADMIN_PASSWORD_BASIC)
 * verify=true   → mode 2: Google-verify first (requires ADMIN_PASSWORD_VERIFIED)
 *
 * Env vars needed:
 *   ADMIN_PASSWORD_BASIC, ADMIN_PASSWORD_VERIFIED
 *   GOOGLE_API_KEY, GOOGLE_CX
 *   GITHUB_TOKEN
 *   GITHUB_OWNER (default: pisanuw)
 *   GITHUB_REPO  (default: lettergame)
 *   GITHUB_BRANCH (default: main)
 */

const GITHUB_OWNER  = process.env.GITHUB_OWNER  || 'pisanuw';
const GITHUB_REPO   = process.env.GITHUB_REPO   || 'lettergame';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const FILE_PATH     = 'words.js';

const VALID_CATEGORIES = [
  'fruits','animals','cities','foods','vegetables','sports','instruments',
  'occupations','birds','flowers','trees','gemstones','dinosaurs','movies',
  'games','tvshows','superheroes','mythology','history','dances',
];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const { password, category, word, verify } = body;

  // --- Auth ---
  const basicPw    = process.env.ADMIN_PASSWORD_BASIC;
  const verifiedPw = process.env.ADMIN_PASSWORD_VERIFIED;

  if (!basicPw || !verifiedPw) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfigured: missing admin passwords' }) };
  }

  const isBasic    = password === basicPw;
  const isVerified = password === verifiedPw;

  if (!isBasic && !isVerified) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid password' }) };
  }

  // Mode 2 requires the verified password
  if (verify && !isVerified) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Verification mode requires the verified password' }) };
  }

  // --- Input validation ---
  if (!category || !VALID_CATEGORIES.includes(category)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid or missing category' }) };
  }
  if (!word || typeof word !== 'string' || word.trim().length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing word' }) };
  }

  const trimmedWord = word.trim();
  const letter = trimmedWord[0].toUpperCase();
  if (!/^[A-Z]$/.test(letter)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Word must start with a letter A-Z' }) };
  }

  // --- Optional Google verification (mode 2) ---
  if (verify) {
    const verifyResult = await verifyWordWithGoogle(trimmedWord, category);
    if (!verifyResult.valid) {
      return {
        statusCode: 422,
        body: JSON.stringify({ error: `Verification failed: ${verifyResult.reason}`, verified: false }),
      };
    }
  }

  // --- Commit to GitHub ---
  try {
    const result = await addWordToGitHub(category, letter, trimmedWord);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, word: trimmedWord, category, letter, sha: result.sha }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

// ---- Google verification ----

async function verifyWordWithGoogle(word, category) {
  const key = process.env.GOOGLE_API_KEY;
  const cx  = process.env.GOOGLE_CX;
  if (!key || !cx) return { valid: false, reason: 'Google API not configured on server' };

  const categoryLabel = categoryDisplayName(category);
  const q = encodeURIComponent(`${word} ${categoryLabel}`);
  const url = `https://www.googleapis.com/customsearch/v1?q=${q}&key=${key}&cx=${cx}&num=3`;

  try {
    const res  = await fetch(url);
    const data = await res.json();

    if (data.error) return { valid: false, reason: `Google API error: ${data.error.message}` };

    const items = data.items || [];
    if (items.length === 0) return { valid: false, reason: 'No Google results found for this word and category' };

    // Check that the word appears in the top results' title or snippet
    const wordLower = word.toLowerCase();
    const matched = items.some(item => {
      const text = ((item.title || '') + ' ' + (item.snippet || '')).toLowerCase();
      return text.includes(wordLower);
    });

    if (!matched) {
      return { valid: false, reason: `Top results don't mention "${word}" in context of "${categoryLabel}"` };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, reason: `Network error during verification: ${err.message}` };
  }
}

function categoryDisplayName(cat) {
  const map = {
    fruits:'Fruits', animals:'Animals', cities:'World Cities', foods:'Foods and Dishes',
    vegetables:'Vegetables', sports:'Sports', instruments:'Musical Instruments',
    occupations:'Occupations', birds:'Birds', flowers:'Flowers', trees:'Trees',
    gemstones:'Gemstones', dinosaurs:'Dinosaurs', movies:'Movies', games:'Video Games',
    tvshows:'TV Shows', superheroes:'Superheroes', mythology:'Mythological Deities',
    history:'Historical Figures', dances:'Dances',
  };
  return map[cat] || cat;
}

// ---- GitHub REST API ----

async function getFile(token) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILE_PATH}?ref=${GITHUB_BRANCH}`;
  const res = await fetch(url, {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) throw new Error(`GitHub GET failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const content = Buffer.from(data.content, 'base64').toString('utf8');
  return { content, sha: data.sha };
}

async function putFile(token, content, sha, commitMessage) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILE_PATH}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: commitMessage,
      content: Buffer.from(content, 'utf8').toString('base64'),
      sha,
      branch: GITHUB_BRANCH,
    }),
  });
  if (!res.ok) throw new Error(`GitHub PUT failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { sha: data.content.sha };
}

function insertWord(content, category, letter, word) {
  // Find the line:   `    ${letter}: ['Word1', 'Word2', ...],`
  // within the category block.
  //
  // Strategy: locate the category key line, then search forward for the
  // letter line. Each word array fits on one line in words.js.

  const lines = content.split('\n');
  const catMarker = `  ${category}: {`;
  const letterMarker = `    ${letter}: [`;

  let inCategory = false;
  let inserted = false;

  const result = lines.map(line => {
    if (!inCategory) {
      if (line.trim().startsWith(`${category}:`) && line.includes('{')) inCategory = true;
      return line;
    }
    // Detect end of category block
    if (line === '  },' || line === '  }') { inCategory = false; return line; }

    if (!inserted && line.trimStart().startsWith(`${letter}: [`)) {
      // Append word to this array line
      inserted = true;
      // Remove trailing `],` or `]`, append word, re-add closing
      const closingMatch = line.match(/(\],?)(\s*)$/);
      if (!closingMatch) return line; // unexpected format, leave alone
      const closing = closingMatch[1];
      const before = line.slice(0, line.lastIndexOf(closing));
      // Escape single quotes in the word
      const escaped = word.replace(/'/g, "\\'");
      return `${before}, '${escaped}'${closing}`;
    }
    return line;
  });

  if (!inserted) {
    throw new Error(`Could not find ${category}[${letter}] in words.js. Does this letter exist for this category?`);
  }

  return result.join('\n');
}

async function addWordToGitHub(category, letter, word) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not configured');

  const { content, sha } = await getFile(token);

  // Check word doesn't already exist
  const wordPattern = new RegExp(`'${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`);
  // We look specifically in the category+letter line
  const lines = content.split('\n');
  let inCat = false;
  for (const line of lines) {
    if (!inCat) {
      if (line.trimStart().startsWith(`${category}:`) && line.includes('{')) inCat = true;
      continue;
    }
    if (line === '  },' || line === '  }') break;
    if (line.trimStart().startsWith(`${letter}: [`)) {
      if (wordPattern.test(line)) {
        throw new Error(`"${word}" already exists in ${category}[${letter}]`);
      }
      break;
    }
  }

  const newContent = insertWord(content, category, letter, word);
  const msg = `Add "${word}" to ${category}[${letter}] via admin`;
  return putFile(token, newContent, sha, msg);
}
