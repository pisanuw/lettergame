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

// Language-specific Wikipedia subdomains
const LANG_CONFIG = {
  en: { wikiLang: 'en' },
  tr: { wikiLang: 'tr' },
};

// All admin-added words go to this single file to avoid merge conflicts
const WEB_WORDS_FILE = 'words-web.js';

const VALID_CATEGORIES = [
  'fruits','animals','cities','foods','vegetables','sports','instruments',
  'occupations','birds','flowers','trees','gemstones','dinosaurs','movies',
  'games','tvshows','superheroes','mythology','history','dances',
  'countries','baseball','football','basketball',
];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const { password, category, word, verify, lang: reqLang } = body;
  const lang = (reqLang && LANG_CONFIG[reqLang]) ? reqLang : 'en';
  const langConfig = LANG_CONFIG[lang];

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

  // --- Optional Wikipedia verification (mode 2) ---
  if (verify) {
    const verifyResult = await verifyWordWithWikipedia(trimmedWord, category, langConfig.wikiLang);
    if (!verifyResult.valid) {
      return {
        statusCode: 422,
        body: JSON.stringify({ error: `Verification failed: ${verifyResult.reason}`, verified: false }),
      };
    }
  }

  // --- Commit to GitHub (append to words-web.js) ---
  try {
    const result = await appendToWebWords(lang, category, trimmedWord);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, word: trimmedWord, category, letter, lang, sha: result.sha }),
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
  countries:   ['country', 'nation', 'sovereign', 'republic', 'kingdom', 'state'],
  baseball:    ['baseball', 'mlb', 'pitcher', 'batter', 'outfielder', 'shortstop', 'major league'],
  football:    ['football', 'nfl', 'quarterback', 'wide receiver', 'linebacker', 'running back'],
  basketball:  ['basketball', 'nba', 'point guard', 'center', 'forward', 'shooting guard'],
};

async function verifyWordWithWikipedia(word, category, wikiLang = 'en') {
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
    const summaryUrl = `https://${wikiLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`;
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
    const searchUrl = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(word + ' ' + categoryLabel)}&srlimit=3&format=json&origin=*`;
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
    countries:'Countries', baseball:'Famous Baseball Players',
    football:'Famous Football Players', basketball:'Famous Basketball Players',
  };
  return map[cat] || cat;
}

// ---- GitHub REST API ----

async function getFile(token, filePath) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`;
  const res = await fetch(url, {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) throw new Error(`GitHub GET failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const content = Buffer.from(data.content, 'base64').toString('utf8');
  return { content, sha: data.sha };
}

async function putFile(token, content, sha, commitMessage, filePath) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;
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

async function appendToWebWords(lang, category, word) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not configured');

  const { content, sha } = await getFile(token, WEB_WORDS_FILE);

  // Check word doesn't already exist in web words
  const escaped = word.replace(/'/g, "\\'");
  if (content.includes(`'${escaped}'`) && content.includes(`'${category}'`) && content.includes(`'${lang}'`)) {
    // More precise: check if exact entry exists
    const entryPattern = new RegExp(
      `\\{\\s*lang:\\s*'${lang}'\\s*,\\s*category:\\s*'${category}'\\s*,\\s*word:\\s*'${escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`
    );
    if (entryPattern.test(content)) {
      throw new Error(`"${word}" already exists in web words for ${category} (${lang})`);
    }
  }

  // Append new entry before the closing ];
  const entry = `  { lang: '${lang}', category: '${category}', word: '${escaped}' },`;
  const newContent = content.replace(
    /^(const WEB_WORDS = \[)\s*/m,
    `$1\n`
  ).replace(
    /\];\s*$/,
    `${entry}\n];\n`
  );

  const msg = `Add "${word}" to ${category}[${lang}] via admin`;
  return putFile(token, newContent, sha, msg, WEB_WORDS_FILE);
}
