# Map One Task

A live workshop demo. An AI interviews a volunteer, one question at a time, about one task they want off their plate. Their answers fill in a five-row map: trigger, context, decisions, actions and exceptions. The AI then suggests who owns each step, checks their existing tools before anything new, and proposes a first test. It ends with an agent plan they can copy into ChatGPT or Claude.

**Hosted copy:** https://jbpete85.github.io/map-one-task/. It plays the recorded interview only (click **Replay example**). The live AI needs the local server below.

## Run it live

You need Node 22 or newer and an OpenRouter API key.

```bash
cp .env.example .env    # then put your key in .env
npm start
```

Open http://localhost:8130. The footer should read **AI ready**.

## On stage

- Type the volunteer's answers and press Enter to send. Shift+Enter adds a new line.
- Click an owner button to change it (AI does it → You approve → You own it). Click any text on the map to edit it. The AI keeps your edits, and a teal edge marks them.
- When the map is finished, **Show the agent plan** opens the plan on screen. **Copy** puts it on the clipboard as plain text.
- **Start over** clears everything.

## If the AI stalls

Click **Replay example**. A recorded interview plays back with no internet connection. Each answer types itself, and Enter sends it. The footer reads **Replay · offline**. To re-record it, start the server, then run `node scripts/record-replay.mjs`.

## How it works

- `server.mjs` uses Node 22 and has no packages. It binds to localhost only and calls OpenRouter with `google/gemini-3.8-flash` at low reasoning effort. A turn takes about 3 seconds, and a full interview costs about 3 cents.
- The app stops itself after $5 of recorded spend per day. Change that with `DAILY_BUDGET_USD`.
- The interview stages and the rules for each answer live in the `system` prompt in `server.mjs`.
- Tools follow buy before build: first what the volunteer already has, then a category of off-the-shelf tool with two or three examples, and only then what is left to build. It never recommends a single tool on its own. The example names come from a short list in the prompt (search for "Draw examples from this list").
