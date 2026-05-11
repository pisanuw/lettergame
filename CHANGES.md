# Changes

Format: `YYYY-MM-DD [type] description` (max 200 chars). Types: decision, plan, doc, scope, code, note.

2026-05-07 [note] Initialized.
2026-05-07 [code] Initial build: index.html, style.css, words.js, game.js — 20 categories, full A-Z word lists, hint button, Netlify-ready
2026-05-07 [decision] No score/win condition, purely collaborative. No letter skipping, Q/X/Z handled with real words (some obscure).
2026-05-07 [code] Doubled word choices (2105 total). Home button in game/end header. Skip button (3/game, yellow in alphabet). Word suggestion via Netlify Forms.
2026-05-07 [decision] Word suggestions use Netlify Forms (AJAX POST to /). Admin configures email notification in Netlify dashboard — no API key in client code.
2026-05-07 [doc] README updated with live URL, repo URL, feature summary.
2026-05-07 [code] Wikipedia image fetch added for computer words (bubble layout, fade-in on load).
2026-05-07 [code] Fixed all words in history category not starting with their letter key (Napoleon Bonaparte etc).
2026-05-08 [code] Google Custom Search fallback added via Netlify serverless function (/.netlify/functions/image-search).
2026-05-08 [decision] API key kept server-side only; client calls proxy function. Keys in Netlify env vars + local .env (git-ignored).
2026-05-08 [code] Category context appended to all image queries to disambiguate (e.g. "Bleeding Heart flower").
2026-05-08 [code] Image prefetch during user turn: computer word and image fetched while user types, Promise stored in prefetchCache.
2026-05-08 [code] Rejected word error message now includes inline "Suggest this word" link opening in-game modal.
2026-05-08 [code] Suggestion modal submits word+category to Netlify Forms; on success advances game treating word as valid (suggested).
2026-05-08 [decision] Skips removed as separate mechanic. Hint button (3 uses) shows one random word. When hints exhausted, button becomes dashed amber Skip.
2026-05-08 [code] Skip shows a word with image in history (right-aligned, dashed amber border). Skipped words shown in end-game recap with actual word.
2026-05-08 [code] SEARCH_OVERRIDES map added for abbreviations/ambiguous terms (UX Designer, EMT, X-Men, etc).
2026-05-08 [code] Fixed image bug when computer goes first (doComputerTurn now async, awaits image Promise before recordWord).
2026-05-08 [note] Live site: https://letter-category.netlify.app/ — repo: https://github.com/pisanuw/lettergame
2026-05-08 [doc] ~/.claude/CLAUDE.md rewritten: AI-log logging made mandatory first step, tables for project records and slash commands, removed redundancy.
2026-05-08 [plan] Hints redesigned: show clue text (not the answer) when Hint pressed. generate-hints.js one-time script uses Claude Haiku to produce one clue per word, saved to hints.js.
2026-05-08 [code] admin.html added: password-gated word admin. Two modes via ADMIN_PASSWORD_BASIC / ADMIN_PASSWORD_VERIFIED. Mode 2 Google-verifies each word before GitHub commit. netlify/functions/admin-add-word.js handles auth, verify, and GitHub REST API commit.
2026-05-08 [code] hints.js generated (one clue per word). Hint button now shows clue text instead of the word itself; lastHintWord still used for computer's next play.
2026-05-08 [doc] README rewritten: hints, admin page, env vars table, local dev instructions. .env.example updated with GITHUB_TOKEN, ADMIN_PASSWORD_BASIC/VERIFIED.
2026-05-08 [decision] Admin passwords: ADMIN_PASSWORD_BASIC (direct add), ADMIN_PASSWORD_VERIFIED (Google-verified add). Both required in Netlify env vars before deploy.
2026-05-09 [doc] Added repo startup instructions to read ~/.claude/CLAUDE.md, BRIEFING.md, CHANGES.md, and MyUnderstanding.md if present.
2026-05-09 [code] Added Turkish starter data files words-tr.js and hints-tr.js with translated category labels and Turkish clue templates.
2026-05-09 [code] Turkish vocabulary complete: words-tr.js contains 100% Turkish words all 20 categories A-Z. All special Turkish characters (ç, ğ, ı, ö, ş, ü) preserved.
2026-05-09 [code] Multi-language support: language selector on setup screen, i18n.js for UI translations, game.js uses active language data. Wikipedia lookups use correct language subdomain (en/tr).
2026-05-09 [code] Admin page and admin-add-word.js updated: lang selector, commits to correct word file per language, Wikipedia verification uses correct language.
2026-05-09 [code] Unit tests (test.js): 45 tests covering word data integrity, hints, i18n structure, HTML/JS wiring, admin function, cross-language consistency.
2026-05-09 [code] Turkish hints replaced: hints-tr.js now contains meaningful Turkish clues instead of generic "Bu bir [kategori]" placeholders. Each hint describes characteristics, origin, use, or appearance (e.g., Armut→autumn harvest fruit, Timsah→crocodile with strong jaw).
2026-05-09 [code] Added 4 English-only categories: Countries (25 letters, no X), Famous Baseball Players, Famous Football Players, Famous Basketball Players. All with full A-Z word lists and hints.
2026-05-09 [code] Game hint/skip button now handles letters with no words (auto-shows Skip instead of Hint). Supports sparse categories like Countries missing X.
2026-05-10 [code] Admin now commits to words-web.js (append-only array) instead of words.js/words-tr.js to avoid git merge conflicts.
2026-05-10 [code] game.js mergeWebWords() merges WEB_WORDS into active word lists at runtime so admin-added words are playable immediately.
2026-05-10 [code] merge-web-words.js: local script reads words-web.js, inserts words into correct files, then clears words-web.js. Run after git pull.
2026-05-09 [doc] Added ~/.claude/commands/git-help-merge.md slash command with step-by-step conflict diff and merge workflow.
2026-05-10 [code] Expanded 9 categories with 98 new words+hints: football(13), basketball(12), baseball(8), history(9), dances(14), tvshows(17), movies(9), superheroes(8), mythology(8).
2026-05-09 [code] Updated Turkish movies to Turk Filmleri with Turkish-title-only entries and synchronized hints in words-tr.js and hints-tr.js.
