const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const MAX_HINTS = 3;

// Image search is proxied through /.netlify/functions/image-search
// so credentials stay server-side (set GOOGLE_API_KEY and GOOGLE_CX in Netlify env vars)

// Active language data (set on language change / game start)
let activeCategories = {};
let activeWords = {};
let activeHints = {};
let activeWikiLang = 'en';
let t = {}; // current UI strings

let state = {
  phase: 'setup',
  lang: 'en',
  category: null,
  currentLetterIndex: 0,
  currentTurn: null,
  history: [],
  usedComputerWords: {},
  hintsLeft: MAX_HINTS,
  lastHintWord: null,
  skippedLetters: new Set(),
};

// Prefetch cache: keyed by letter, value is { word, imageUrl } or null
const prefetchCache = {};

let el = {};

function $(id) { return document.getElementById(id); }

// Merge WEB_WORDS entries into a words object (mutates a deep copy)
function mergeWebWords(words, lang) {
  if (typeof WEB_WORDS === 'undefined' || !WEB_WORDS.length) return words;
  // Deep copy so we don't mutate the original data
  const merged = JSON.parse(JSON.stringify(words));
  for (const entry of WEB_WORDS) {
    if (entry.lang !== lang) continue;
    const cat = entry.category;
    const word = entry.word;
    if (!word || !cat) continue;
    const letter = word[0].toUpperCase();
    if (!merged[cat]) merged[cat] = {};
    if (!merged[cat][letter]) merged[cat][letter] = [];
    // Avoid duplicates
    if (!merged[cat][letter].some(w => w.toLowerCase() === word.toLowerCase())) {
      merged[cat][letter].push(word);
    }
  }
  return merged;
}

function setLanguage(lang) {
  state.lang = lang;
  const data = LANG[lang] || LANG.en;
  activeCategories = data.categories;
  activeWords      = mergeWebWords(data.words, lang);
  activeHints      = data.hints;
  activeWikiLang   = data.wikiLang;
  t = UI[lang] || UI.en;

  // Update HTML lang attribute
  document.getElementById('html-root').lang = lang;

  // Rebuild category dropdown
  const select = el.categorySelect;
  // Remove all options except the first "Pick for me"
  while (select.options.length > 1) select.remove(1);
  $('pick-for-me-opt').textContent = t.pickForMe;
  Object.entries(activeCategories).forEach(([key, name]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = name;
    select.appendChild(opt);
  });

  // Update static UI text
  $('game-title').textContent = t.title;
  $('game-subtitle').textContent = t.subtitle;
  $('game-hints-note').innerHTML = t.hintsNote;
  $('lang-label').textContent = t.chooseLanguage;
  $('cat-label').textContent = t.chooseCategory;
  $('start-btn').textContent = t.startGame;
  $('home-label').textContent = t.home;
  $('submit-label').textContent = t.submit;
  $('quit-label').textContent = t.quit;
  $('complete-heading').textContent = t.complete;
  $('play-again-label').textContent = t.playAgain;
  $('end-home-label').textContent = t.home;
  el.wordInput.placeholder = t.typeWord;
}

function init() {
  el = {
    setupScreen:     $('setup-screen'),
    gameScreen:      $('game-screen'),
    endScreen:       $('end-screen'),
    langSelect:      $('lang-select'),
    categorySelect:  $('category-select'),
    startBtn:        $('start-btn'),
    categoryDisplay: $('category-display'),
    letterDisplay:   $('letter-display'),
    alphabet:        $('alphabet'),
    wordHistory:     $('word-history'),
    turnIndicator:   $('turn-indicator'),
    inputArea:       $('input-area'),
    wordInput:       $('word-input'),
    submitBtn:       $('submit-btn'),
    errorMsg:        $('error-msg'),
    hintBtn:         $('hint-btn'),
    hintLabel:       $('hint-label'),
    hintCount:       $('hint-count'),
    hintText:        $('hint-text'),
    quitBtn:         $('quit-btn'),
    homeBtn:         $('home-btn'),
    endCategory:     $('end-category'),
    finalWords:      $('final-words'),
    playAgainBtn:    $('play-again-btn'),
    endHomeBtn:      $('end-home-btn'),
    // suggestion (end screen)
    sugSection:      $('suggest-section'),
    sugCategoryName: $('sug-category-name'),
    sugWord:         $('sug-word'),
    sugError:        $('sug-error'),
    sugSubmitBtn:    $('sug-submit-btn'),
    sugSkipBtn:      $('sug-skip-btn'),
    sugFormWrap:     $('suggest-form-wrap'),
    sugSuccess:      $('suggest-success'),
  };

  // Set initial language
  setLanguage(el.langSelect.value || 'en');

  // Language change handler
  el.langSelect.addEventListener('change', () => setLanguage(el.langSelect.value));

  // Game events
  el.startBtn.addEventListener('click', startGame);
  el.submitBtn.addEventListener('click', handleSubmit);
  el.wordInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleSubmit(); });
  el.hintBtn.addEventListener('click', () => {
    const words = (activeWords[state.category] || {})[currentLetter()] || [];
    if (state.hintsLeft > 0 && words.length > 0) showHint();
    else handleSkip();
  });
  el.quitBtn.addEventListener('click', resetToSetup);
  el.homeBtn.addEventListener('click', resetToSetup);
  el.playAgainBtn.addEventListener('click', resetToSetup);
  el.endHomeBtn.addEventListener('click', resetToSetup);

  // Suggestion events (end screen)
  el.sugSubmitBtn.addEventListener('click', handleSuggestion);
  el.sugSkipBtn.addEventListener('click', () => {
    el.sugSection.classList.add('hidden');
  });
  el.sugWord.addEventListener('keydown', e => { if (e.key === 'Enter') handleSuggestion(); });

}

function showScreen(name) {
  ['setup-screen', 'game-screen', 'end-screen'].forEach(id => {
    $(id).classList.toggle('active', id === name + '-screen');
  });
}

function resetToSetup() {
  state = {
    phase: 'setup',
    lang: state.lang,
    category: null,
    currentLetterIndex: 0,
    currentTurn: null,
    history: [],
    usedComputerWords: {},
    hintsLeft: MAX_HINTS,
    lastHintWord: null,
    skippedLetters: new Set(),
  };
  el.wordHistory.innerHTML = '';
  el.hintText.classList.add('hidden');
  el.errorMsg.classList.add('hidden');
  showScreen('setup');
}

function startGame() {
  state.currentLetterIndex = 0;
  state.history = [];
  state.usedComputerWords = {};
  state.hintsLeft = MAX_HINTS;
  state.lastHintWord = null;
  state.skippedLetters = new Set();
  state.phase = 'playing';
  // Clear prefetch cache from previous game
  Object.keys(prefetchCache).forEach(k => delete prefetchCache[k]);

  const selected = el.categorySelect.value;
  const keys = Object.keys(activeCategories);
  state.category = selected || keys[Math.floor(Math.random() * keys.length)];

  el.categoryDisplay.textContent = activeCategories[state.category];
  el.wordHistory.innerHTML = '';
  el.hintText.classList.add('hidden');
  el.errorMsg.classList.add('hidden');

  state.currentTurn = Math.random() < 0.5 ? 'user' : 'computer';

  showScreen('game');
  renderAlphabet();
  updateUI();

  if (state.currentTurn === 'computer') scheduleComputerTurn();
}

function currentLetter() {
  return LETTERS[state.currentLetterIndex];
}

function renderAlphabet() {
  el.alphabet.innerHTML = LETTERS.map((l, i) => {
    let cls = 'alpha-chip';
    if (i < state.currentLetterIndex) {
      cls += state.skippedLetters.has(l) ? ' skipped' : ' done';
    }
    if (i === state.currentLetterIndex) cls += ' current';
    return `<span class="${cls}">${l}</span>`;
  }).join('');
}

function updateUI() {
  renderAlphabet();
  el.letterDisplay.textContent = currentLetter();
  el.hintText.classList.add('hidden');
  el.errorMsg.classList.add('hidden');

  if (state.currentTurn === 'user') {
    el.turnIndicator.textContent = t.yourTurn(activeCategories[state.category], currentLetter());
    el.inputArea.classList.remove('hidden');
    el.hintBtn.classList.remove('hidden');
    updateHintButton();
    el.wordInput.value = '';
    el.wordInput.focus();
    // While user is thinking, silently pick and prefetch the computer's next word
    prefetchNextComputerWord();
  } else {
    el.turnIndicator.textContent = t.computerThinking;
    el.inputArea.classList.add('hidden');
    el.hintBtn.classList.add('hidden');
  }
}

function pickComputerWord(letter) {
  const words = (activeWords[state.category] || {})[letter] || [];
  if (words.length === 0) return null;
  const used = state.usedComputerWords[letter] || new Set();
  const available = words.filter(w => !used.has(w.toLowerCase()));
  const pool = available.length > 0 ? available : words;
  return pool[Math.floor(Math.random() * pool.length)];
}

function prefetchNextComputerWord() {
  // Computer plays every other turn, one letter ahead of user's current letter
  const nextIndex = state.currentLetterIndex + 1;
  if (nextIndex >= 26) return;
  const letter = LETTERS[nextIndex];
  if (prefetchCache[letter] !== undefined) return; // already in-flight or done

  const word = pickComputerWord(letter);
  if (!word) { prefetchCache[letter] = null; return; }

  // Store the Promise so doComputerTurn can await it whether it's done or not
  prefetchCache[letter] = {
    word,
    imagePromise: fetchWikiImage(word, state.category),
  };
}

function scheduleComputerTurn() {
  const delay = 900 + Math.random() * 700;
  setTimeout(doComputerTurn, delay);
}

async function doComputerTurn() {
  if (state.phase !== 'playing') return;

  const letter = currentLetter();
  const cached = prefetchCache[letter];

  let word, imageUrl;

  if (cached && cached.word) {
    // Await the Promise -- likely already resolved during user's turn
    word     = cached.word;
    imageUrl = await cached.imagePromise;
  } else {
    // Computer went first or cache missed -- pick and fetch now
    word = pickComputerWord(letter);
    if (!word) { recordWord(t.noneFound, 'computer', null); return; }
    imageUrl = await fetchWikiImage(word, state.category);
  }

  recordWord(word, 'computer', imageUrl);
}

function handleSubmit() {
  const raw = el.wordInput.value.trim();
  if (!raw) return;

  const letter = currentLetter();

  if (!raw.toUpperCase().startsWith(letter)) {
    showError(t.wrongLetter(raw, letter));
    return;
  }

  const words = (activeWords[state.category] || {})[letter] || [];
  const match = words.find(w => w.toLowerCase() === raw.toLowerCase());

  if (!match) {
    showError(t.notInList(raw, activeCategories[state.category]), raw);
    return;
  }

  el.errorMsg.classList.add('hidden');
  el.hintText.classList.add('hidden');
  recordWord(match, 'user');
}

async function handleSkip() {
  if (state.currentTurn !== 'user') return;

  const letter = currentLetter();
  // Use the hint word if one was shown this turn, otherwise pick a random word
  const word = state.lastHintWord || pickComputerWord(letter);
  const imageUrl = word ? await fetchWikiImage(word, state.category) : null;

  state.skippedLetters.add(letter);
  const displayWord = word || '(none)';
  state.history.push({ word: displayWord, player: 'skipped', letter });

  const row = document.createElement('div');
  row.className = 'history-row skipped-row';
  row.innerHTML = `
    <div class="h-meta">
      <span class="h-letter">${letter}</span>
      <span class="h-word">${displayWord} (${t.skipped})</span>
    </div>
    ${imageUrl ? `<img class="word-img loaded" src="${imageUrl}" alt="${displayWord}">` : ''}
  `;
  el.wordHistory.appendChild(row);
  el.wordHistory.scrollTop = el.wordHistory.scrollHeight;

  el.hintText.classList.add('hidden');
  el.errorMsg.classList.add('hidden');

  state.currentLetterIndex++;
  state.lastHintWord = null;

  if (state.currentLetterIndex >= 26) {
    state.phase = 'ended';
    setTimeout(endGame, 400);
    return;
  }

  state.currentTurn = 'computer';
  updateUI();
  scheduleComputerTurn();
}

function recordWord(word, player, prefetchedImageUrl = undefined) {
  const letter = currentLetter();

  if (player === 'computer') {
    if (!state.usedComputerWords[letter]) state.usedComputerWords[letter] = new Set();
    state.usedComputerWords[letter].add(word.toLowerCase());
  }

  state.history.push({ word, player, letter });
  appendWordToHistory(word, player, letter, prefetchedImageUrl);

  state.currentLetterIndex++;
  state.lastHintWord = null;

  if (state.currentLetterIndex >= 26) {
    state.phase = 'ended';
    setTimeout(endGame, 400);
    return;
  }

  state.currentTurn = state.currentTurn === 'user' ? 'computer' : 'user';
  updateUI();

  if (state.currentTurn === 'computer') scheduleComputerTurn();
}

function appendWordToHistory(word, player, letter, imageUrl) {
  const row = document.createElement('div');
  row.className = `history-row ${player}`;

  if (player === 'computer') {
    row.innerHTML = `
      <div class="h-meta">
        <span class="h-letter">${letter}</span>
        <span class="h-word">${word}</span>
        <span class="h-who">${t.computer}</span>
      </div>
      <img class="word-img" alt="${word}">
    `;
    const img = row.querySelector('.word-img');
    if (imageUrl) {
      img.src = imageUrl;
      img.classList.add('loaded');
    } else {
      img.remove();
    }
  } else {
    row.innerHTML = `
      <span class="h-letter">${letter}</span>
      <span class="h-word">${word}</span>
      <span class="h-who">${t.you}</span>
    `;
  }

  el.wordHistory.appendChild(row);
  el.wordHistory.scrollTop = el.wordHistory.scrollHeight;
}

// Override search terms for words that don't match well on Wikipedia as-is
const SEARCH_OVERRIDES = {
  'UX Designer':          'User Experience Designer',
  'EMT':                  'Emergency Medical Technician',
  'ET':                   'E.T. the Extra-Terrestrial film',
  'X-Men':                'X-Men Marvel Comics',
  'X-Files':              'The X-Files TV show',
  'XCOM':                 'XCOM video game',
  'XO Sauce':             'XO sauce Hong Kong',
  'X-ray Tetra':          'X-ray tetra fish',
  'X-Games':              'X Games extreme sports',
  'X-23':                 'X-23 Marvel Comics',
  "Xi'an":                "Xi'an city China",
};

// Singular form of the category name used as search context (e.g. "Flowers" -> "flower")
const CATEGORY_HINT = {
  en: {
    fruits:      'fruit',
    animals:     'animal',
    cities:      'city',
    foods:       'food dish',
    vegetables:  'vegetable',
    sports:      'sport',
    instruments: 'musical instrument',
    occupations: 'occupation',
    birds:       'bird',
    flowers:     'flower',
    trees:       'tree',
    gemstones:   'gemstone',
    dinosaurs:   'dinosaur',
    movies:      'movie',
    games:       'video game',
    tvshows:     'TV show',
    superheroes: 'superhero',
    mythology:   'mythological deity',
    history:     'historical figure',
    dances:      'dance',
    countries:   'country',
    baseball:    'famous baseball player',
    football:    'famous football player',
    basketball:  'famous basketball player',
  },
  tr: {
    fruits:      'meyve',
    animals:     'hayvan',
    cities:      'sehir',
    foods:       'yemek',
    vegetables:  'sebze',
    sports:      'spor',
    instruments: 'muzik aleti',
    occupations: 'meslek',
    birds:       'kus',
    flowers:     'cicek',
    trees:       'agac',
    gemstones:   'degerli tas',
    dinosaurs:   'dinozor',
    movies:      'film',
    games:       'video oyunu',
    tvshows:     'dizi',
    superheroes: 'super kahraman',
    mythology:   'mitoloji',
    history:     'tarihi kisi',
    dances:      'dans',
  },
};

function getCategoryHint(category) {
  const langHints = CATEGORY_HINT[state.lang] || CATEGORY_HINT.en;
  return langHints[category] || '';
}

// 1. Try Wikipedia REST API directly (fastest, no quota)
async function tryWikiDirect(word) {
  try {
    const q = encodeURIComponent(word.replace(/ /g, '_'));
    const res = await fetch(`https://${activeWikiLang}.wikipedia.org/api/rest_v1/page/summary/${q}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.thumbnail?.source ?? null;
  } catch { return null; }
}

// 2. Search Wikipedia with category context, then fetch the top article's image
async function tryWikiSearch(word, category) {
  try {
    const hint = getCategoryHint(category);
    const q = encodeURIComponent(hint ? `${word} ${hint}` : word);
    const res = await fetch(
      `https://${activeWikiLang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}&srlimit=1&format=json&origin=*`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const title = data.query?.search?.[0]?.title;
    if (!title) return null;
    return tryWikiDirect(title);
  } catch { return null; }
}

// 3. Google Custom Search fallback with category context
async function tryGoogleImage(word, category) {
  try {
    const hint = getCategoryHint(category);
    const q = encodeURIComponent(hint ? `${word} ${hint}` : word);
    const res = await fetch(`/.netlify/functions/image-search?q=${q}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.items?.[0]?.link ?? null;
  } catch { return null; }
}

async function fetchWikiImage(word, category) {
  const searchWord = SEARCH_OVERRIDES[word] ?? word;
  return (await tryWikiDirect(searchWord))
      ?? (await tryWikiSearch(searchWord, category))
      ?? (await tryGoogleImage(searchWord, category));
}

function showHint() {
  const letter = currentLetter();
  const words = (activeWords[state.category] || {})[letter] || [];

  if (words.length === 0) {
    el.hintText.textContent = t.noHints;
    el.hintText.classList.remove('hidden');
    return;
  }

  // Pick a random word and show its hint clue (not the word itself)
  const word = words[Math.floor(Math.random() * words.length)];
  state.lastHintWord = word;
  state.hintsLeft--;

  const clue = (activeHints[state.category]?.[letter]?.[word]) || t.hintFallback(letter);
  el.hintText.textContent = `${t.hint}: ${clue}`;
  el.hintText.classList.remove('hidden');

  updateHintButton();
}

function updateHintButton() {
  const words = (activeWords[state.category] || {})[currentLetter()] || [];
  if (state.hintsLeft > 0 && words.length > 0) {
    el.hintBtn.className = 'btn btn-secondary';
    el.hintLabel.textContent = t.hint;
    el.hintCount.textContent = `(${state.hintsLeft} ${t.left})`;
    el.hintCount.classList.remove('hidden');
  } else {
    el.hintBtn.className = 'btn btn-hint-skip';
    el.hintLabel.textContent = t.skip;
    el.hintCount.classList.add('hidden');
  }
}

function showError(msg, suggestWord = null) {
  if (suggestWord) {
    const link = document.createElement('a');
    link.href = '#';
    link.className = 'suggest-link';
    link.textContent = t.suggestLink;
    link.addEventListener('click', e => {
      e.preventDefault();
      suggestWordToServer(suggestWord);
    });
    el.errorMsg.textContent = msg + ' ';
    el.errorMsg.appendChild(link);
  } else {
    el.errorMsg.textContent = msg;
  }
  el.errorMsg.classList.remove('hidden');
}

function acceptSuggestion(word) {
  const letter = currentLetter();
  const displayWord = `${word} (${t.suggested})`;
  state.history.push({ word: displayWord, player: 'user', letter });

  const row = document.createElement('div');
  row.className = 'history-row user';
  row.innerHTML = `
    <span class="h-letter">${letter}</span>
    <span class="h-word">${displayWord}</span>
    <span class="h-who">${t.you}</span>
  `;
  el.wordHistory.appendChild(row);
  el.wordHistory.scrollTop = el.wordHistory.scrollHeight;

  el.errorMsg.classList.add('hidden');
  el.hintText.classList.add('hidden');

  state.currentLetterIndex++;
  state.lastHintWord = null;

  if (state.currentLetterIndex >= 26) {
    state.phase = 'ended';
    setTimeout(endGame, 400);
    return;
  }

  state.currentTurn = 'computer';
  updateUI();
  scheduleComputerTurn();
}

// --- In-game word suggestion (serverless Wikipedia check) ---

async function suggestWordToServer(word) {
  // Show checking status inline (no modal)
  el.errorMsg.textContent = t.checking;
  el.errorMsg.classList.remove('hidden');

  try {
    const res = await fetch('/.netlify/functions/suggest-word', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word,
        category: state.category,
        lang: state.lang,
      }),
    });
    const data = await res.json();

    if (data.accepted) {
      // Word verified and added to GitHub
      el.errorMsg.textContent = t.wordAdded;
      el.errorMsg.classList.remove('hidden');
      // Also add to local activeWords so the word works for the rest of this session
      const letter = word[0].toUpperCase();
      if (!activeWords[state.category]) activeWords[state.category] = {};
      if (!activeWords[state.category][letter]) activeWords[state.category][letter] = [];
      if (!activeWords[state.category][letter].some(w => w.toLowerCase() === word.toLowerCase())) {
        activeWords[state.category][letter].push(word);
      }
      setTimeout(() => acceptSuggestion(word), 1200);
    } else {
      // Not verified; email sent to admin. Skip this word.
      el.errorMsg.textContent = t.wordSentAdmin;
      el.errorMsg.classList.remove('hidden');
      setTimeout(() => handleSkip(), 1500);
    }
  } catch {
    el.errorMsg.textContent = t.networkError;
    el.errorMsg.classList.remove('hidden');
  }
}

function endGame() {
  el.endCategory.textContent = `${t.category}: ${activeCategories[state.category]}`;
  el.finalWords.innerHTML = state.history.map(({ word, player, letter }) => {
    if (player === 'skipped') {
      return `<div class="final-row skipped">
        <span class="f-letter">${letter}</span>
        <span class="f-word">${word} (${t.skipped})</span>
        <span class="f-who">${t.you}</span>
      </div>`;
    }
    return `<div class="final-row ${player}">
      <span class="f-letter">${letter}</span>
      <span class="f-word">${word}</span>
      <span class="f-who">${player === 'user' ? t.you : t.computer}</span>
    </div>`;
  }).join('');

  // Reset suggestion section
  el.sugCategoryName.innerHTML = t.suggestPrompt(activeCategories[state.category]);
  el.sugWord.value = '';
  el.sugEmail.value = '';
  el.sugError.classList.add('hidden');
  el.sugFormWrap.classList.remove('hidden');
  el.sugSuccess.classList.add('hidden');
  el.sugSection.classList.remove('hidden');

  showScreen('end');
}

// --- Word Suggestion ---

async function handleSuggestion() {
  const word     = el.sugWord.value.trim();
  const category = state.category;

  if (!word) {
    showSugError(t.enterWord);
    return;
  }

  el.sugSubmitBtn.disabled = true;
  el.sugSubmitBtn.textContent = t.checking;

  try {
    const res = await fetch('/.netlify/functions/suggest-word', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word, category, lang: state.lang }),
    });
    const data = await res.json();

    if (data.accepted) {
      el.sugFormWrap.classList.add('hidden');
      el.sugSuccess.querySelector('.success-msg').textContent = t.wordAdded;
      el.sugSuccess.classList.remove('hidden');
    } else {
      el.sugFormWrap.classList.add('hidden');
      el.sugSuccess.querySelector('.success-msg').textContent = t.wordSentAdmin;
      el.sugSuccess.classList.remove('hidden');
    }
  } catch {
    showSugError(t.networkError);
  } finally {
    el.sugSubmitBtn.disabled = false;
    el.sugSubmitBtn.textContent = t.suggest;
  }
}

function showSugError(msg) {
  el.sugError.textContent = msg;
  el.sugError.classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', init);
