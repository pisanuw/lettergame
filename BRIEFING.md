# Briefing

## Session Start

At the start of every project session, read `~/.claude/CLAUDE.md`, then read this file fully and the last 30 lines of `CHANGES.md` before making changes.

- **Purpose**: Browser word game where user and computer alternate naming things in a category, following the alphabet A to Z.
- **Current scope**: Plain HTML/CSS/JS single-page app (index.html, style.css, words.js, game.js). 24 English categories (20 shared + 4 English-only: Countries, Baseball, Football, Basketball), 20 Turkish categories. Multi-language support via i18n.js, words-tr.js, hints-tr.js. User types a word validated against the word list. Computer picks randomly with image fetched from Wikipedia (Google Custom Search fallback). Game ends at Z.
- **Key decisions**:
  - No score, purely collaborative/casual.
  - Hints (3 per game): pressing Hint shows a clue text (from hints.js, not the word itself). The hinted word is still used as the computer's next play. When hints exhausted, button becomes a Skip.
  - Skip shows a suggested word with image in history (right-aligned, dashed amber). No separate skip counter.
  - Unknown words show an inline "Suggest this word" link. Clicking calls /.netlify/functions/suggest-word which checks Wikipedia. If verified, word is auto-added to words-web.js and accepted in-game. If not verified, email is sent to admin and the turn is skipped.
  - Images fetched via: Wikipedia REST API, Wikipedia Search API, Google Custom Search proxy (/.netlify/functions/image-search). Images prefetched during user turn.
  - Google API key and CX stored server-side in Netlify env vars (GOOGLE_API_KEY, GOOGLE_CX); local .env is git-ignored.
  - SMTP email (Resend) for admin notifications: AUTH_SMTP_HOST, AUTH_SMTP_PORT, AUTH_SMTP_USER, AUTH_SMTP_PASS, AUTH_SMTP_FROM, ADMIN_EMAIL.
  - Feedback form (feedback.html) sends email to admin via /.netlify/functions/send-feedback. All emails include client metadata (IP, browser, country).
  - SEARCH_OVERRIDES map in game.js handles abbreviations/ambiguous terms for image search.
  - Admin page (admin.html): password-gated, two modes. ADMIN_PASSWORD_BASIC adds directly; ADMIN_PASSWORD_VERIFIED runs Google search check first. Commits to words-web.js (append-only array) via GitHub REST API (GITHUB_TOKEN env var). Run `node merge-web-words.js` locally after pull to fold web-added words into words.js/words-tr.js.
  - hints.js: pre-generated clues (one per word) via generate-hints.js (one-time Claude Haiku script). Regenerate when new words are added.
- **Non-goals**: No backend, no accounts, no timer/pressure mechanics, no scoring.
- **Live site**: https://letter-category.netlify.app/
- **Repo**: https://github.com/pisanuw/lettergame
