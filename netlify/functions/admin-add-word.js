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

// ---- Wikipedia verification ----
// Fetch the Wikipedia summary for the word and check that category keywords
// appear in the summary. Falls back to Wikipedia search if no direct page.

// Keywords that confirm a word belongs to a category.
// Using specific terms avoids false positives (e.g. "treelike" for Trees).
const CATEGORY_KEYWORDS = {
  fruits:      ['fruit', 'berry', 'drupe', 'citrus'],
  animals:     ['animal', 'mammal', 'reptile', 'amphibian', 'species of', 'genus'],
  cities:      ['city', 'capital', 'town', 'municipality', 'metropolis'],
  foods:       ['food', 'dish', 'cuisine', 'recipe', 'meal', 'snack', 'dessert'],
  vegetables:  ['vegetable', 'root vegetable', 'leafy', 'edible plant'],
  sports:      ['sport', 'athletic', 'competition', 'game played'],
  instruments: ['instrument', 'musical instrument', 'played by', 'strings', 'percussion', 'woodwind', 'brass'],
  occupations: ['occupation', 'profession', 'career', 'job', 'practitioner', 'worker'],
  birds:       ['bird', 'avian', 'species of bird', 'passerine', 'raptor', 'waterfowl'],
  flowers:     ['flower', 'flowering plant', 'bloom', 'blossom', 'floral'],
  trees:       ['\\btree\\b', 'woody plant', 'shrub', 'conifer', 'deciduous', 'evergreen'],
  gemstones:   ['gemstone', 'gem', 'mineral', 'crystal', 'precious stone', 'semiprecious'],
  dinosaurs:   ['dinosaur', 'prehistoric', 'theropod', 'sauropod', 'cretaceous', 'jurassic'],
  movies:      ['film', 'movie', 'cinema', 'directed by', 'box office'],
  games:       ['video game', 'game developed', 'game published', 'role-playing', 'action game'],
  tvshows:     ['television series', 'tv series', 'sitcom', 'drama series', 'aired on', 'episodes'],
  superheroes: ['superhero', 'comic book', 'marvel', 'dc comics', 'fictional character'],
  mythology:   ['deity', 'god', 'goddess', 'mythology', 'mythological', 'divine'],
  history:     ['politician', 'statesman', 'general', 'emperor', 'queen', 'king', 'leader', 'president', 'philosopher', 'scientist', 'explorer'],
  dances:      ['dance', 'dancing', 'choreography', 'music genre'],
};

async function verifyWordWithGoogle(word, category) {
  const categoryLabel = categoryDisplayName(category);
  const keywords = CATEGORY_KEYWORDS[category] || [categoryLabel.toLowerCase()];

  function textMatches(text) {
    const t = text.toLowerCase();
    return keywords.some(kw => {
      // Keywords starting with \b use regex word boundaries; others use plain includes
      if (kw.startsWith('\\b')) {
        return new RegExp(kw).test(t);
      }
      return t.includes(kw);
    });
  }

  try {
    // 1. Try direct page summary
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`;
    const res = await fetch(summaryUrl, { headers: { 'User-Agent': 'lettergame-admin/1.0' } });

    if (res.ok) {
      const data = await res.json();
      if (data.type === 'standard') {
        const text = (data.description || '') + ' ' + (data.extract || '');
        if (textMatches(text)) return { valid: true };
        return {
          valid: false,
          reason: `Wikipedia article for "${word}" doesn't confirm it as a ${categoryLabel.toLowerCase().replace(/s$/, '')}`,
        };
      }
    }

    // 2. Fall back to Wikipedia search
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(word + ' ' + categoryLabel)}&srlimit=3&format=json&origin=*`;
    const sRes  = await fetch(searchUrl, { headers: { 'User-Agent': 'lettergame-admin/1.0' } });
    const sData = await sRes.json();
    const results = sData.query?.search || [];

    if (results.length === 0) {
      return { valid: false, reason: `No Wikipedia results found for "${word}" in category "${categoryLabel}"` };
    }

    const matched = results.some(r => textMatches((r.title || '') + ' ' + (r.snippet || '')));
    if (!matched) {
      return { valid: false, reason: `Wikipedia search doesn't confirm "${word}" as a ${categoryLabel.toLowerCase().replace(/s$/, '')}` };
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
