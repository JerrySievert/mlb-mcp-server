# MLB MCP Server

An MCP (Model Context Protocol) server that gives any MCP-capable LLM real-time access to MLB and MiLB baseball data via the free [MLB Stats API](https://statsapi.mlb.com/) (statsapi.mlb.com).

**No API key required.** No signup. No rate-limit keys. It just works.

## Install

```bash
npm install @jerrysv/mlb-mcp-server
```

Or run directly with npx:

```bash
npx @jerrysv/mlb-mcp-server
```

## Usage

Pass team names as arguments to track specific teams. The server fuzzy-matches names against the MLB Stats API at startup.

```bash
# Generic mode — all tools work, no pre-configured teams
npx @jerrysv/mlb-mcp-server

# Track specific teams by name
npx @jerrysv/mlb-mcp-server mariners diamondbacks "hillsboro hops"

# Track by team ID
npx @jerrysv/mlb-mcp-server 136 109 419

# Track by abbreviation
npx @jerrysv/mlb-mcp-server SEA ARI

# Mix and match
npx @jerrysv/mlb-mcp-server mariners 109 "hillsboro hops"
```

Team names are fuzzy-matched, so typos like "Diamonbacks" or "Seattel Mariners" will still resolve correctly. The server logs fuzzy matches to stderr so you can verify.

When teams are tracked, the server exposes them via `get_tracked_teams` and `resolve_team` for quick lookups. Without team args, the LLM can still discover any team via `get_all_mlb_teams`.

## What you get

### Tools (22)

| Category               | Tools                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| **Teams**              | `get_tracked_teams`, `resolve_team`, `get_team_roster`, `get_all_mlb_teams`, `get_team_affiliates` |
| **Players**            | `find_player`, `get_player`, `search_player_on_team`                                               |
| **Games & Schedule**   | `get_games_today`, `get_games_by_date`, `get_team_schedule`                                        |
| **Live Game Data**     | `get_game_feed`, `get_box_score`, `get_line_score`, `get_play_by_play`                             |
| **Standings**          | `get_standings`                                                                                    |
| **Stats & Leaders**    | `get_player_stats`, `get_team_stats`, `get_team_leaders`, `get_league_leaders`                     |
| **Transactions**       | `get_transactions`                                                                                 |
| **Venues**             | `get_venues`                                                                                       |
| **Season & Reference** | `get_current_season`, `get_sport_ids`                                                              |

### Resources (3)

| Resource               | URI                        | Description                                                   |
| ---------------------- | -------------------------- | ------------------------------------------------------------- |
| **Tracked Teams**      | `mlb://tracked-teams`      | Team IDs, abbreviations, aliases, leagues, and sport IDs      |
| **Team Abbreviations** | `mlb://team-abbreviations` | Quick reference of tracked team abbreviations and IDs         |
| **Sport IDs**          | `mlb://sport-ids`          | League level reference: 1=MLB, 11=AAA, 12=AA, 13=High-A, etc. |

### Prompts (3)

| Prompt            | Arguments                      | Description                                                          |
| ----------------- | ------------------------------ | -------------------------------------------------------------------- |
| **team-overview** | `team` (required)              | Roster, standings, recent results, and upcoming schedule for a team  |
| **game-recap**    | `date`, `team` (both optional) | Detailed game recap with scores, key plays, and box score highlights |
| **player-report** | `player` (required)            | Bio, current season stats, recent performance, and transactions      |

## Prerequisites

- **Node.js 18+** — check with `node --version`

That's it. No API keys needed.

## Connecting to Claude Code

Add to `~/.claude.json` or a project `.mcp.json`:

```json
{
  "mcpServers": {
    "mlb": {
      "command": "npx",
      "args": [
        "@jerrysv/mlb-mcp-server",
        "mariners",
        "diamondbacks",
        "hillsboro hops"
      ]
    }
  }
}
```

Or without tracked teams:

```json
{
  "mcpServers": {
    "mlb": {
      "command": "npx",
      "args": ["@jerrysv/mlb-mcp-server"]
    }
  }
}
```

## Connecting to other MCP clients

Any MCP-compatible client (Ollama + Open WebUI, LM Studio, etc.) can use this server. It communicates over **stdio**:

```bash
npx @jerrysv/mlb-mcp-server mariners
```

Point your client's MCP config at that command.

## Common team IDs

| Team                 | ID  | Sport ID    |
| -------------------- | --- | ----------- |
| Seattle Mariners     | 136 | 1 (MLB)     |
| Arizona Diamondbacks | 109 | 1 (MLB)     |
| New York Yankees     | 147 | 1 (MLB)     |
| Los Angeles Dodgers  | 119 | 1 (MLB)     |
| Hillsboro Hops       | 419 | 13 (High-A) |

Use `get_all_mlb_teams` or `get_sport_ids` to discover any team.

## Tool reference

### Teams

- **`get_tracked_teams`** — List the teams this server is tracking with IDs, abbreviations, aliases, and league info.
- **`resolve_team`** `(team)` — Resolve a fuzzy team name or abbreviation to its canonical info. Only works for tracked teams.
- **`get_team_roster`** `(team_id, roster_type?)` — Get the active roster for a team. Roster types: `active` (default), `fullSeason`, `fullRoster`, `depthChart`, `coach`.
- **`get_all_mlb_teams`** `(sport_id?)` — List all teams for a league level. Sport IDs: 1=MLB, 11=AAA, 12=AA, 13=High-A, 14=Single-A.
- **`get_team_affiliates`** `(team_id)` — Get minor league affiliates for an MLB team. Shows the full farm system.

### Players

- **`find_player`** `(name, team?)` — Search for any MLB/MiLB player by name. Returns person IDs, positions, teams, and basic bio. The best starting point for player lookups.
- **`get_player`** `(person_id, season?)` — Get full detailed info and season stats for a player by person ID.
- **`search_player_on_team`** `(team_id, name)` — Search for a player by name within a specific team's roster.

### Games & Schedule

- **`get_games_today`** `(sport_id?)` — Get all games scheduled for today with scores and status.
- **`get_games_by_date`** `(date, sport_id?)` — Get all games for a specific date (YYYY-MM-DD format).
- **`get_team_schedule`** `(team_id, start_date?, end_date?, sport_id?)` — Get upcoming or past games for a team. Defaults to 14 days from start date.

### Live Game Data

- **`get_game_feed`** `(game_pk)` — Full live game feed: scores, plays, decisions, linescore, weather, probable pitchers.
- **`get_box_score`** `(game_pk)` — Box score with batting, pitching, and fielding stats for both teams.
- **`get_line_score`** `(game_pk)` — Inning-by-inning runs, hits, and errors.
- **`get_play_by_play`** `(game_pk)` — Full play-by-play with scoring plays highlighted and last play summary.

### Standings

- **`get_standings`** `(season?)` — Current MLB standings by division: wins, losses, PCT, games back, streak.

### Stats & Leaders

- **`get_player_stats`** `(person_id, season?)` — Season stats (batting, pitching, fielding) for a player.
- **`get_team_stats`** `(team_id, season?, group?)` — Aggregate team stats. Group: `hitting` (default) or `pitching`.
- **`get_team_leaders`** `(team_id, season?, category?)` — Stat leaders on a team. Categories: `homeRuns`, `battingAverage`, `earnedRunAverage`, `strikeouts`, etc.
- **`get_league_leaders`** `(category?, season?, stat_group?, limit?)` — MLB-wide stat leaders. Categories: `homeRuns`, `battingAverage`, `earnedRunAverage`, `strikeouts`, `wins`, `saves`.

### Transactions

- **`get_transactions`** `(team_id?, start_date?, end_date?)` — Recent transactions: trades, signings, call-ups, DFAs, IL moves. Defaults to last 7 days.

### Venues

- **`get_venues`** — Info on MLB stadiums and ballparks.

### Season & Reference

- **`get_current_season`** `(season?)` — Season metadata: start/end dates, all-star game, postseason dates.
- **`get_sport_ids`** — List all league levels with sport IDs (MLB=1, AAA=11, AA=12, High-A=13, etc).

## Example conversations

> "Are there any Mariners games today?"
> — calls `get_games_today`, then filters for SEA

> "Tell me about Julio Rodriguez"
> — calls `find_player("Julio Rodriguez")` → person ID 677594, then `get_player(677594)`

> "Show me the Mariners roster"
> — calls `resolve_team("Mariners")` → teamId 136, then `get_team_roster(136)`

> "How are the D-backs doing this season?"
> — calls `get_standings`, finds ARI in NL West

> "What are the Hillsboro Hops' upcoming games?"
> — calls `get_team_schedule(419)` with sportId 13

> "Show me the farm system for Arizona"
> — calls `get_team_affiliates(109)`

> "Give me the box score for game 777245"
> — calls `get_box_score(777245)`

> "Who leads MLB in home runs?"
> — calls `get_league_leaders(category: "homeRuns")`

> "Any recent Mariners transactions?"
> — calls `get_transactions(team_id: 136)`

## Setup (from source)

```bash
git clone <repo-url>
cd mlb
npm install
npm test
node src/index.js mariners diamondbacks
```

## Project structure

```
mlb/
  src/
    index.js        — MCP server (tools, resources, prompts)
    api-client.js   — HTTP client for statsapi.mlb.com
    teams.js        — Dynamic tracked team registry and fuzzy resolver
    helpers.js      — Date formatting, text helpers
  test/
    api-client.test.js
    helpers.test.js
    teams.test.js
  package.json
  README.md
```

## Running tests

```bash
npm test
```

87 tests, zero external dependencies beyond `@modelcontextprotocol/sdk`. All API client tests mock `fetch` — no real network calls.

## License

MIT
