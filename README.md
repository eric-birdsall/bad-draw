# Drunk Drawing

Drunk Drawing is a same-room drawing and guessing game. Your team guesses out loud while your ink drifts away from where you aim.

Run `npm ci` and `npm run dev`, then open the URL Vite prints. Use `npm test` for the game logic tests and `npm run build` to make a static build. All 1,000 prompts are bundled locally. Each is rated easy, medium, or hard in `shared/badDrawWords.js`; hard words are hidden for now (see `pickWord` in `src/badDraw.js`), leaving 671 in play. The game needs no backend.

It is built for touch screens only (phones and tablets). There are no keyboard or controller controls.

Pick a drawer and have everyone else look away. Press and hold **Hold to reveal**, then let go before starting the timer. Drag your finger on the paper to draw. The drawer can use **Undo** twice and **Clear** once. Tap **Correct!** when the group guesses the word. The final drawing and score appear when the round ends.

The ink wobbles with a slow lean, gets further off and faster as the clock runs down (1.6× by the end), and hiccups 5 times a round at random moments: a quick jolt out and back, with a "hic!" by the pen. A tall beer meter beside the paper drains over the round, from Sober to Wasted.

Pick a difficulty before each round. **Easy** is a gentle sway with 2 hiccups, 2 minutes, 4 undos, and 2 clears. **Medium** uses the defaults above: 5 hiccups, 90 seconds, 2 undos, and 1 clear. **Hard** lurches further and faster with 9 hiccups, 60 seconds, 1 undo, and 1 clear. Presets live in `PRESETS` in `src/badDraw.js`. To fine-tune a round, tap the gear next to the difficulty buttons on the main menu. Settings are only available before a round starts, never during one. Tuning carries over until you reset it, change difficulty, or reload the page.

Additional prompts were sourced from the [Datamuse API](https://www.datamuse.com/api/) and screened using [Brysbaert et al.’s concreteness ratings](https://pubmed.ncbi.nlm.nih.gov/24142837/).
