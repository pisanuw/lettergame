/**
 * suggest-word.js
 *
 * Netlify Function -- POST /suggest-word
 *
 * Body (JSON): { word, category, lang }
 *
 * 1. Checks Wikipedia to verify the word belongs to the category.
 * 2. If verified: appends to words-web.js via GitHub API, returns { accepted: true }.
 * 3. If not verified: sends email to admin via SMTP, returns { accepted: false }.
 *
 * No authentication required (called from in-game suggestion link).
 *
 * Env vars needed:
 *   GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH
 *   AUTH_SMTP_HOST, AUTH_SMTP_PORT, AUTH_SMTP_USER, AUTH_SMTP_PASS, AUTH_SMTP_FROM
 *   ADMIN_EMAIL
 */

const nodemailer = require('nodemailer');

const GITHUB_OWNER  = process.env.GITHUB_OWNER  || 'pisanuw';
const GITHUB_REPO   = process.env.GITHUB_REPO   || 'lettergame';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const WEB_WORDS_FILE = 'words-web.js';

const LANG_CONFIG = {
  en: { wikiLang: 'en' },
  tr: { wikiLang: 'tr' },
};

// Category keys and display names (single source of truth shared with admin-add-word.js)
const CATEGORY_DISPLAY = {
  fruits:'Fruits', animals:'Animals', cities:'World Cities', foods:'Foods and Dishes',
  vegetables:'Vegetables', sports:'Sports', instruments:'Musical Instruments',
  occupations:'Occupations', birds:'Birds', flowers:'Flowers', trees:'Trees',
  gemstones:'Gemstones', dinosaurs:'Dinosaurs', movies:'Movies', games:'Video Games',
  tvshows:'TV Shows', superheroes:'Superheroes', mythology:'Mythological Deities',
  history:'Historical Figures', dances:'Dances',
  countries:'Countries', baseball:'Famous Baseball Players',
  football:'Famous Football Players', basketball:'Famous Basketball Players',
};

const VALID_CATEGORIES = Object.keys(CATEGORY_DISPLAY);

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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { word, category, lang: reqLang } = body;
  const lang = (reqLang && LANG_CONFIG[reqLang]) ? reqLang : 'en';
  const wikiLang = LANG_CONFIG[lang].wikiLang;

  if (!category || !VALID_CATEGORIES.includes(category)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid category' }) };
  }
  if (!word || typeof word !== 'string' || word.trim().length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing word' }) };
  }

  const trimmed = word.trim();
  const letter = trimmed[0].toUpperCase();
  if (!/^[A-Z]$/.test(letter)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Word must start with A-Z' }) };
  }

  // Wikipedia verification
  const result = await verifyWithWikipedia(trimmed, category, wikiLang);

  if (result.valid) {
    // Verified: add to words-web.js via GitHub
    try {
      await appendToWebWords(lang, category, trimmed);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accepted: true, word: trimmed, category, letter }),
      };
    } catch (err) {
      return {
        statusCode: 500,
        body: JSON.stringify({ accepted: false, error: err.message }),
      };
    }
  } else {
    // Not verified: email admin with client details
    const clientInfo = {
      ip: event.headers['x-forwarded-for']
        || event.headers['x-nf-client-connection-ip']
        || event.headers['client-ip']
        || 'unknown',
      userAgent: event.headers['user-agent'] || 'unknown',
      country: event.headers['x-country'] || event.headers['x-nf-country-code'] || '',
      acceptLang: event.headers['accept-language'] || '',
    };
    try {
      await emailAdmin(trimmed, category, lang, result.reason, clientInfo);
    } catch (err) {
      console.error('SMTP error:', err.message);
      // Don't fail the request if email fails; the user still gets feedback
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accepted: false, reason: result.reason }),
    };
  }
};

// ---- Wikipedia verification ----

async function verifyWithWikipedia(word, category, wikiLang) {
  const catLabel = CATEGORY_DISPLAY[category] || category;
  const keywords = CATEGORY_KEYWORDS[category] || [catLabel.toLowerCase()];

  function textMatches(text) {
    const t = text.toLowerCase();
    return keywords.some(kw => {
      if (kw.startsWith('\\b')) return new RegExp(kw).test(t);
      return t.includes(kw);
    });
  }

  try {
    // 1. Direct page summary
    const summaryUrl = `https://${wikiLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`;
    const res = await fetch(summaryUrl, { headers: { 'User-Agent': 'lettergame/1.0' } });

    if (res.ok) {
      const data = await res.json();
      if (data.type === 'standard') {
        const text = (data.description || '') + ' ' + (data.extract || '');
        if (textMatches(text)) return { valid: true };
        return {
          valid: false,
          reason: `Wikipedia article for "${word}" doesn't confirm it as a ${catLabel.toLowerCase().replace(/s$/, '')}`,
        };
      }
    }

    // 2. Search fallback
    const searchUrl = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(word + ' ' + catLabel)}&srlimit=3&format=json&origin=*`;
    const sRes = await fetch(searchUrl, { headers: { 'User-Agent': 'lettergame/1.0' } });
    const sData = await sRes.json();
    const results = sData.query?.search || [];

    if (results.length === 0) {
      return { valid: false, reason: `No Wikipedia results for "${word}" in "${catLabel}"` };
    }

    const matched = results.some(r => textMatches((r.title || '') + ' ' + (r.snippet || '')));
    if (!matched) {
      return { valid: false, reason: `Wikipedia search doesn't confirm "${word}" as a ${catLabel.toLowerCase().replace(/s$/, '')}` };
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, reason: `Verification error: ${err.message}` };
  }
}

// ---- GitHub API ----

async function getFile(token, filePath) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`;
  const res = await fetch(url, {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) throw new Error(`GitHub GET failed: ${res.status}`);
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
  if (!res.ok) throw new Error(`GitHub PUT failed: ${res.status}`);
  return await res.json();
}

async function appendToWebWords(lang, category, word) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not configured');

  const { content, sha } = await getFile(token, WEB_WORDS_FILE);

  const escaped = word.replace(/'/g, "\\'");
  const entryPattern = new RegExp(
    `\\{\\s*lang:\\s*'${lang}'\\s*,\\s*category:\\s*'${category}'\\s*,\\s*word:\\s*'${escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`
  );
  if (entryPattern.test(content)) {
    throw new Error(`"${word}" already exists in web words`);
  }

  const entry = `  { lang: '${lang}', category: '${category}', word: '${escaped}' },`;
  const newContent = content.replace(
    /^(const WEB_WORDS = \[)\s*/m, `$1\n`
  ).replace(
    /\];\s*$/, `${entry}\n];\n`
  );

  const msg = `Add "${word}" to ${category}[${lang}] via suggest`;
  return putFile(token, newContent, sha, msg, WEB_WORDS_FILE);
}

// ---- SMTP email ----

async function emailAdmin(word, category, lang, reason, clientInfo = {}) {
  const host = process.env.AUTH_SMTP_HOST;
  if (!host) return; // SMTP not configured, skip silently

  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.AUTH_SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.AUTH_SMTP_USER,
      pass: process.env.AUTH_SMTP_PASS,
    },
  });

  const adminEmail = process.env.ADMIN_EMAIL || 'yusuf.pisan@gmail.com';
  const catLabel = CATEGORY_DISPLAY[category] || category;

  await transporter.sendMail({
    from: process.env.AUTH_SMTP_FROM || 'noreply@lettergame.app',
    to: adminEmail,
    subject: `[Letter Game] Word suggestion: "${word}" in ${catLabel}`,
    text: [
      `A player suggested "${word}" for the ${catLabel} category (${lang}).`,
      '',
      `Wikipedia verification failed:`,
      reason,
      '',
      `To add manually, go to the admin page or run:`,
      `  node merge-web-words.js`,
      '',
      'Client Details:',
      `  IP Address:      ${clientInfo.ip || 'unknown'}`,
      `  Country:         ${clientInfo.country || '(not available)'}`,
      `  User-Agent:      ${clientInfo.userAgent || 'unknown'}`,
      `  Accept-Language: ${clientInfo.acceptLang || '(not available)'}`,
      `  Timestamp:       ${new Date().toISOString()}`,
      '',
      '-- Letter Game',
    ].join('\n'),
  });
}
