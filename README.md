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

You get **3 skips** per game. Use them wisely on tough letters.

## Categories

20 categories including Fruits, Animals, World Cities, Foods, Vegetables, Sports, Musical Instruments, Occupations, Birds, Flowers, Trees, Gemstones, Dinosaurs, Movies, Video Games, TV Shows, Superheroes, Mythological Deities, Historical Figures, and Dances.

## Suggest a word

Use the **Suggest a Word** button on the home screen to submit missing words. Suggestions are reviewed by the admin before being added.

## Tech

Plain HTML, CSS, and JavaScript — no build step, no framework, no backend.
Deployed on [Netlify](https://netlify.com).
Computer images fetched from the [Wikipedia REST API](https://en.wikipedia.org/api/rest_v1/).
Word suggestions use [Netlify Forms](https://docs.netlify.com/forms/setup/).
