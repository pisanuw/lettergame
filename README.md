# Letter Game

A browser word game where you and the computer take turns naming things in a category — one letter at a time, A through Z.

**Live site:** https://letter-category.netlify.app/
**Repository:** https://github.com/pisanuw/lettergame

## How to play

1. Choose a category (or let the computer pick one at random).
2. The computer or you starts — chosen randomly.
3. Name something in the category that starts with the current letter.
4. Alternate turns through the full alphabet, A to Z.
5. Reach Z together to complete the game.

**Hints (3 per game):** press Hint to receive a clue about a valid word for the current letter. When all hints are used, the button becomes a Skip — it fills in a word for you and moves the game forward.

## Categories

20 categories: Fruits, Animals, World Cities, Foods, Vegetables, Sports, Musical Instruments, Occupations, Birds, Flowers, Trees, Gemstones, Dinosaurs, Movies, Video Games, TV Shows, Superheroes, Mythological Deities, Historical Figures, and Dances. 2105 words total with full A-Z coverage.

## Suggest a word

If your word is rejected, an inline **Suggest this word** link opens a modal. Submit it and the word is accepted immediately as a suggested entry, then sent to the admin for review.

## Tech

Plain HTML, CSS, and JavaScript — no build step, no framework.
Deployed on [Netlify](https://netlify.com).

- Computer images: [Wikipedia REST API](https://en.wikipedia.org/api/rest_v1/) with Google Custom Search fallback via a Netlify serverless function.
- Word suggestions: [Netlify Forms](https://docs.netlify.com/forms/setup/).
- Hints: pre-generated clues stored in `hints.js` (one clue per word, generated with `generate-hints.js`).

## Admin

`/admin.html` is a password-gated page for adding new words to the word list.

Two modes, each with its own password:
- **Basic:** add words directly to the list.
- **Verified:** each word is checked against Google search results before being committed.

Words are committed directly to `words.js` in the GitHub repository via the GitHub REST API. No manual file editing required.

## Local development

```bash
npm install -g netlify-cli
cp .env.example .env   # fill in your keys
netlify dev            # serves on http://localhost:8888
```

Required environment variables (see `.env.example`):

| Variable | Purpose |
|---|---|
| `GOOGLE_API_KEY` | Google Custom Search API key |
| `GOOGLE_CX` | Google Custom Search Engine ID |
| `GITHUB_TOKEN` | GitHub token with repo write access (for admin) |
| `ADMIN_PASSWORD_BASIC` | Admin password — basic mode |
| `ADMIN_PASSWORD_VERIFIED` | Admin password — verified mode |
