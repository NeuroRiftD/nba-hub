# NBA HUB: live NBA hub

Scores, box scores with player popups, rosters, standings, team schedule and news, with a "My Team" you can follow.
No dependencies. Needs Node 18+.

## Run it
    node server.js
    # open http://localhost:3000

## Put it online (any Node host: Render, Railway, Fly.io)
1. Push this folder to a GitHub repo.
2. Create a new Web Service from the repo. Start command: `node server.js` (no build step).
3. The host sets PORT for you. Open the URL it gives you.

## How it works
- `server.js` fetches ESPN's public NBA JSON, reshapes it, caches it for 15s (live games) to 1 day (teams), and serves it at /api/*.
- `public/index.html` calls those routes and refreshes live games every 20s.
- Routes: /api/scoreboard?date=YYYY-MM-DD, /api/live, /api/recent, /api/month?ym=YYYY-MM, /api/game/:id, /api/teams, /api/roster/:id, /api/schedule/:id, /api/standings, /api/news[?team=id], /api/injuries, /api/moves, /api/players, /api/player/:id

## Heads up
- ESPN's endpoints are unofficial and can change without notice. If a section goes blank, check that route in the browser first.
- For a commercial app, swap in a licensed provider (e.g. Sportradar): rewrite the functions in server.js and keep the same JSON shapes.
- Team logos and player photos load from ESPN's image servers.

## Updating to a new version
1. Close the black Command Prompt window (this stops the old server).
2. Extract the new zip into a NEW folder and run `node server.js` from inside it.
3. In your browser press Ctrl+F5.
4. Check the small version tag next to NBA HUB at the top (currently v12). If it is missing, or a red "server is out of date" banner shows, you are still looking at an old copy.
