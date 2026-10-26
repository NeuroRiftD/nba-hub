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

## Live box score
- While a game is in progress, the box score shows the five players on the floor in their own **On Court** section at the top, with everyone else under **Bench**. ESPN doesn't publish who is on the floor, so the app starts from the starting five and replays the substitutions in the play-by-play. It can lag a few seconds. If the substitutions don't add up (for example a name it can't match), it shows the normal table and says the live lineup isn't available.

## Stats
- On the Stats tab, use the team box above the table to switch between All NBA and a single team (or tap ★ My team). Tap the TEAM heading to sort A to Z. When you sort by a per-game stat (points, rebounds, shooting percentages and so on), players who have played fewer than 70% of their team's games are listed after everyone else and shown dimmed, so a one-game 40-point night doesn't top the list. The Leaders tab only ranks players who have played at least 70% of their team's games.
- ESPN's season averages can run a game or two behind the real games. When a team has finished a regular-season game in the last three days that ESPN hasn't counted yet, the app adds that game's box score to the players' points, rebounds, assists, steals, blocks, minutes, turnovers and fouls (and their totals). A small note on the Stats and Leaders tabs says when that has happened. Shooting percentages and the other extra columns catch up when ESPN does. If ESPN is already up to date, nothing is added.

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
4. Check the small version tag next to NBA HUB at the top (currently v1.1). If it is missing, or a red "server is out of date" banner shows, you are still looking at an old copy.

## Highlights, special events and your team
- **Video clips** on Home come from YouTube channels' public feeds and play in a popup. There are two tabs: **NBA** (the official NBA channel) and **Others** (every other channel grouped together, newest first, with the channel name on each clip). It ships with House of Highlights, Bleacher Report, NBA on ESPN, Ximo Pierto, FreeDawkins and JxmyHighroller as the Others.
- To add or remove channels, edit `highlights.json`: one line per channel, with a `name` and a `channelId` (the long code that starts with UC; find it on the channel's About page under Share > Copy channel ID). A channel with `"group": "NBA"` goes in the NBA tab; the rest go in Others. If a channel's id is wrong or its feed is down, that channel is skipped and the rest still show.
- **events.json** lists events that ESPN's schedule leaves out, such as the All-Star Saturday contests. Add or change lines there and they get a star on the Schedule calendar.
- **My Team** and your place on the page are remembered in your own browser. There are no accounts.

## Injuries
- The injury report combines ESPN's injury list, the injuries ESPN pins on each roster, and your own file, **injuries-extra.json**.
- ESPN sometimes misses long-term injuries (it shows Johnny Furphy as healthy, for example). Add them by hand in `injuries-extra.json`. Copy the Furphy entry and change it:
      { "name": "Player Name", "id": "ESPN player id", "team": "IND", "pos": "G", "status": "Out for season", "note": "Knee · Torn ACL", "comment": "Out for the season.", "until": "2027-07-01" }
  `name` and `team` (the 3-letter code, like IND) are the only required parts. `id` is the number at the end of the player's ESPN page address (espn.com/nba/player/_/id/**5157066**/...); if you leave it out, the app finds it from the roster. `until` is optional: after that date the entry disappears by itself.
- Your file always wins over ESPN. Delete the entry when the player is back. Changes show up within 10 minutes, or right away if you restart the server.
- If a status says "out for the season" in ESPN's own notes, it is labelled "Out for season" automatically.

## If the league stats look wrong
- Open `http://localhost:3000/api/statsdebug` in your browser. It shows exactly what ESPN sends for the league stats (the column names and two sample players). Copy what it shows and send it along, and the stats columns can be matched exactly. The same page also has a `catchUp` section that shows the top scorers before and after the app added any games ESPN was missing, plus a note if it couldn't read the schedule or a box score.

## Version numbers
- This release is **1.1**. Each update adds one tenth: 1.2, 1.3, and so on. The number shows next to NBA HUB at the top of the page.

## If the highlight clips say YouTube isn't answering
- YouTube's feeds fail now and then. The app tries the channel's feed, then its uploads-playlist feed, waits and tries again. If it still can't get through, it shows the last clips it saved (in a hidden file called `.highlights-cache.json` next to `server.js`; you can delete it any time) and the page keeps retrying by itself every 30 seconds until clips show up. If a channel never loads, double-check its `channelId` in `highlights.json`.
