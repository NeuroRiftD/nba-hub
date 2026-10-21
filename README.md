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
4. Check the small version tag next to NBA HUB at the top (currently v14). If it is missing, or a red "server is out of date" banner shows, you are still looking at an old copy.

## Highlights, special events and your team
- **Video clips** on Home come from the NBA's YouTube channel automatically and play in a popup. To add more channels, edit `highlights.json` (a channel's id is the long code that starts with UC).
- **X posts:** on Home, open Highlights > From X and paste a post link. It is saved in your browser and plays in a popup. To show the same posts to everyone who visits your site, add the links to `"posts"` in `highlights.json`.
- **events.json** lists events that ESPN's schedule leaves out, such as the All-Star Saturday contests. Add or change lines there and they get a star on the Schedule calendar.
- **My Team** and your place on the page are remembered in your own browser. There are no accounts.

## Injuries
- The injury report combines ESPN's injury list, the injuries ESPN pins on each roster, and your own file, **injuries-extra.json**.
- ESPN sometimes misses long-term injuries (it shows Johnny Furphy as healthy, for example). Add them by hand in `injuries-extra.json`. Copy the Furphy entry and change it:
      { "name": "Player Name", "id": "ESPN player id", "team": "IND", "pos": "G", "status": "Out for season", "note": "Knee · Torn ACL", "comment": "Out for the season.", "until": "2027-07-01" }
  `name` and `team` (the 3-letter code, like IND) are the only required parts. `id` is the number at the end of the player's ESPN page address (espn.com/nba/player/_/id/**5157066**/...); if you leave it out, the app finds it from the roster. `until` is optional: after that date the entry disappears by itself.
- Your file always wins over ESPN. Delete the entry when the player is back. Changes show up within 10 minutes, or right away if you restart the server.
- If a status says "out for the season" in ESPN's own notes, it is labelled "Out for season" automatically.
