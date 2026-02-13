#!/usr/bin/env node

/**
 * MLB MCP Server
 *
 * An MCP (Model Context Protocol) server that exposes MLB Stats API data
 * (statsapi.mlb.com) as tools and resources so any MCP-capable LLM can
 * look up teams, players, games, scores, standings, box scores,
 * play-by-play, transactions, and more.
 *
 * No API key required — the MLB Stats API is free and open.
 *
 * Usage:
 *   npx @jerrysv/mlb-mcp-server                          # generic — all teams
 *   npx @jerrysv/mlb-mcp-server mariners diamondbacks    # track specific teams
 *   npx @jerrysv/mlb-mcp-server 136 109 419              # track by team ID
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { MLBStatsClient } from './api-client.js';
import {
  resolveTeam,
  listTrackedTeams,
  getTrackedTeams,
  setTrackedTeams,
  buildTrackedTeam,
  resolveTeamArgs
} from './teams.js';
import {
  toAPIDate,
  todayDate,
  currentSeasonYear,
  formatGameSummary,
  formatRosterEntry,
  textContent,
  jsonContent
} from './helpers.js';

// ── Helpers for dynamic descriptions ─────────────────────────────────
//
// These functions generate text that is embedded into the MCP server
// description, tool descriptions, and parameter descriptions at
// registration time.  They read from the tracked-teams registry, so
// they must be called *after* resolveStartupTeams() has populated it.

/**
 * Build a human-readable summary of all tracked teams, including each
 * team's full name, abbreviation, teamId, sportId, and level.
 * Returns an empty string when no teams are tracked.
 */
function teamSummary() {
  const teams = listTrackedTeams();
  if (teams.length === 0) return '';
  return teams
    .map((t) => {
      const level = t.level ? `, ${t.level}` : '';
      return `${t.name} (${t.key}, teamId=${t.teamId}, sportId=${t.sportId}${level})`;
    })
    .join('; ');
}

/**
 * Build example text for team_id parameter descriptions.
 * e.g. "136 for Seattle Mariners, 109 for Arizona Diamondbacks".
 * Falls back to a generic hint when no teams are tracked.
 */
function teamIdExamples(fallback) {
  const teams = listTrackedTeams();
  if (teams.length === 0)
    return fallback || 'use get_all_mlb_teams to find team IDs';
  return teams.map((t) => `${t.teamId} for ${t.name}`).join(', ');
}

/**
 * Build the top-level MCP server description string.
 * Includes the tracked team summary when teams are configured.
 */
function serverDescription() {
  const summary = teamSummary();
  const base =
    'MLB & MiLB baseball data — teams, players, live scores, standings, ' +
    'box scores, play-by-play, transactions, and more via the free MLB Stats API. ' +
    'No API key required.';
  if (!summary) return base;
  return `${base} Tracking: ${summary}.`;
}

// ── Build & start server ─────────────────────────────────────────────

/**
 * Construct the MCP server with all resources, prompts, and tools registered.
 *
 * Called from main() *after* tracked teams have been resolved, so that
 * dynamic description helpers (teamSummary, teamIdExamples) produce
 * correct text that includes the configured teams.
 *
 * @param {MLBStatsClient} client  HTTP client for the MLB Stats API
 * @returns {McpServer}
 */
function buildServer(client) {
  const server = new McpServer({
    name: 'mlb',
    version: '1.0.0',
    description: serverDescription()
  });

  // ── Resources ──────────────────────────────────────────────────────

  server.resource(
    'tracked-teams',
    'mlb://tracked-teams',
    {
      description:
        'The teams this server is tracking. ' +
        'Includes team IDs, abbreviations, aliases, leagues, and sport IDs.',
      mimeType: 'application/json'
    },
    async () => {
      const teams = getTrackedTeams();
      const hasTeams = Object.keys(teams).length > 0;
      return {
        contents: [
          {
            uri: 'mlb://tracked-teams',
            mimeType: 'application/json',
            text: hasTeams
              ? JSON.stringify(teams, null, 2)
              : JSON.stringify({
                  note: 'No teams are being tracked. Pass team names as arguments when starting the server, or use get_all_mlb_teams to discover teams.'
                })
          }
        ]
      };
    }
  );

  server.resource(
    'team-abbreviations',
    'mlb://team-abbreviations',
    {
      description: 'Quick reference of tracked team abbreviations and IDs.',
      mimeType: 'text/plain'
    },
    async () => {
      const teams = listTrackedTeams();
      const text =
        teams.length > 0
          ? teams
              .map(
                (t) =>
                  `${t.key} (teamId: ${t.teamId}) = ${t.name} (${t.league})`
              )
              .join('\n')
          : 'No teams are being tracked. Use get_all_mlb_teams to discover teams.';
      return {
        contents: [
          { uri: 'mlb://team-abbreviations', mimeType: 'text/plain', text }
        ]
      };
    }
  );

  server.resource(
    'sport-ids',
    'mlb://sport-ids',
    {
      description:
        'Sport ID reference for querying different league levels: ' +
        '1=MLB, 11=AAA, 12=AA, 13=High-A, 14=Single-A, 16=Rookie.',
      mimeType: 'text/plain'
    },
    async () => ({
      contents: [
        {
          uri: 'mlb://sport-ids',
          mimeType: 'text/plain',
          text: [
            '1  = MLB (Major League Baseball)',
            '11 = AAA (Triple-A)',
            '12 = AA (Double-A)',
            '13 = High-A',
            '14 = Single-A',
            '16 = Rookie'
          ].join('\n')
        }
      ]
    })
  );

  // ── Prompts ────────────────────────────────────────────────────────

  server.prompt(
    'team-overview',
    {
      team: z.string().describe('Team name or abbreviation')
    },
    ({ team }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Give me a complete overview of the ${team}. ` +
              `Include their current roster, season standings, recent game results, ` +
              `and upcoming schedule. Use the MLB MCP tools to look up live data.`
          }
        }
      ]
    })
  );

  server.prompt(
    'game-recap',
    {
      date: z
        .string()
        .optional()
        .describe('Date in YYYY-MM-DD format (defaults to today)'),
      team: z
        .string()
        .optional()
        .describe('Team name or abbreviation to focus on')
    },
    ({ date, team }) => {
      const d = date || todayDate();
      const teamPart = team ? ` for the ${team}` : '';
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text:
                `Give me a detailed game recap${teamPart} on ${d}. ` +
                `Include final scores, key plays, standout performances, and box score highlights. ` +
                `Use the MLB MCP tools to fetch live data.`
            }
          }
        ]
      };
    }
  );

  server.prompt(
    'player-report',
    { player: z.string().describe('Player name to look up') },
    ({ player }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Give me a detailed report on ${player}. ` +
              `Include their bio, current season stats, recent game performance, ` +
              `and any recent transactions. Use the MLB MCP tools.`
          }
        }
      ]
    })
  );

  // ── Tools ──────────────────────────────────────────────────────────

  // ---------- Teams ----------

  server.tool(
    'get_tracked_teams',
    (() => {
      const summary = teamSummary();
      if (!summary)
        return 'List the teams this server is tracking. No teams are currently tracked — use get_all_mlb_teams to discover teams.';
      return `List the teams this server is tracking: ${summary}. Use these team IDs with other tools.`;
    })(),
    {},
    async () => {
      const teams = listTrackedTeams();
      if (teams.length === 0) {
        return textContent(
          'No teams are being tracked. The server was started without team arguments. ' +
            'Use get_all_mlb_teams to discover teams and their IDs.'
        );
      }
      return jsonContent('Tracked Teams', teams);
    }
  );

  server.tool(
    'resolve_team',
    'Resolve a fuzzy team name or abbreviation to its canonical info including teamId. ' +
      'Only works for tracked teams. For other teams, use get_all_mlb_teams.',
    { team: z.string().describe('Team name, nickname, or abbreviation') },
    async ({ team }) => {
      const t = resolveTeam(team);
      if (!t) {
        const tracked = listTrackedTeams();
        const hint =
          tracked.length > 0
            ? `Tracked teams: ${tracked.map((t) => t.key).join(', ')}. `
            : 'No teams are being tracked. ';
        return textContent(
          `Could not resolve "${team}". ${hint}` +
            `Use get_all_mlb_teams to find any team's ID.`
        );
      }
      return jsonContent(`Resolved: ${t.name}`, t);
    }
  );

  server.tool(
    'get_team_roster',
    'Get the active roster for a team by team ID. Returns player names, positions, jersey numbers, and person IDs.',
    {
      team_id: z
        .number()
        .describe(`MLB Stats API team ID (${teamIdExamples()})`),
      roster_type: z
        .string()
        .optional()
        .describe(
          'Roster type: "active" (default), "fullSeason", "fullRoster", "depthChart", "coach"'
        )
    },
    async ({ team_id, roster_type }) => {
      const data = await client.teamRoster(team_id, roster_type || 'active');
      const entries = data.roster || [];
      if (entries.length === 0)
        return textContent(`No roster entries found for team ${team_id}.`);
      const lines = entries.map(formatRosterEntry);
      return textContent(
        `Roster for team ${team_id} (${entries.length} players):\n\n${lines.join('\n')}`
      );
    }
  );

  server.tool(
    'get_all_mlb_teams',
    'List all teams for a league level. Use sportId 1 for MLB, 11 for AAA, 12 for AA, 13 for High-A, 14 for Single-A.',
    {
      sport_id: z
        .number()
        .optional()
        .describe(
          'Sport ID: 1=MLB (default), 11=AAA, 12=AA, 13=High-A, 14=Single-A'
        )
    },
    async ({ sport_id }) => {
      const sid = sport_id ?? 1;
      const data = await client.teams(sid);
      const teams = data.teams || [];
      const lines = teams.map(
        (t) =>
          `${t.abbreviation || '?'} (ID: ${t.id}) — ${t.name} | ` +
          `${t.league?.name || '?'} | ${t.division?.name || 'N/A'} | ` +
          `Venue: ${t.venue?.name || '?'}`
      );
      return textContent(
        `Teams for sportId ${sid} (${teams.length}):\n\n${lines.join('\n')}`
      );
    }
  );

  server.tool(
    'get_team_affiliates',
    'Get minor league affiliates for an MLB team. Shows the full farm system.',
    {
      team_id: z.number().describe(`MLB parent team ID (${teamIdExamples()})`)
    },
    async ({ team_id }) => {
      const data = await client.teamAffiliates(team_id);
      const teams = data.teams || [];
      const lines = teams.map(
        (t) =>
          `${t.name} (ID: ${t.id}) — ${t.sport?.name || '?'} | ` +
          `${t.league?.name || '?'} | Venue: ${t.venue?.name || '?'}`
      );
      return textContent(
        `Affiliates for team ${team_id} (${teams.length}):\n\n${lines.join('\n')}`
      );
    }
  );

  // ---------- Players ----------

  server.tool(
    'find_player',
    'THE BEST WAY TO LOOK UP A PLAYER. Search for any MLB player by name — just pass a name like ' +
      '"Julio Rodriguez", "Corbin Carroll", or "Logan Gilbert". Returns matching players with their ' +
      'person IDs, positions, teams, and basic bio. Use this whenever you need to find a player. ' +
      'You do NOT need a team ID or person ID to use this tool.',
    {
      name: z
        .string()
        .describe(
          'Player name to search for (e.g. "Julio Rodriguez", "Corbin Carroll")'
        ),
      team: z
        .string()
        .optional()
        .describe('Optional team name or abbreviation to narrow results')
    },
    async ({ name, team }) => {
      const data = await client.searchPeople(name);
      let people = data.people || [];

      if (team && people.length > 1) {
        const resolved = resolveTeam(team);
        if (resolved) {
          const teamFiltered = people.filter(
            (p) => p.currentTeam?.id === resolved.teamId
          );
          if (teamFiltered.length > 0) people = teamFiltered;
        }
      }

      if (people.length === 0) {
        return textContent(
          `No players found matching "${name}". Try a different spelling or just a last name.`
        );
      }

      const lines = people.slice(0, 15).map((p) => {
        const pos = p.primaryPosition?.abbreviation || '?';
        const num = p.primaryNumber ? `#${p.primaryNumber}` : '';
        const team = p.currentTeam?.id
          ? `Team ID: ${p.currentTeam.id}`
          : 'No current team';
        const bats = p.batSide?.code ? `B:${p.batSide.code}` : '';
        const throws = p.pitchHand?.code ? `T:${p.pitchHand.code}` : '';
        const active = p.active ? 'Active' : 'Inactive';
        return `${p.fullName} ${num} | ${pos} | ${bats} ${throws} | ${active} | ${team} | Person ID: ${p.id}`;
      });

      const note =
        people.length > 15
          ? `\n\n... showing first 15 of ${people.length} matches`
          : '';
      const hint =
        '\n\nUse the person ID with get_player to get full stats, or with get_player_stats for season numbers.';

      return textContent(
        `Players matching "${name}" (${people.length} results):\n\n${lines.join('\n')}${note}${hint}`
      );
    }
  );

  server.tool(
    'get_player',
    'Get FULL detailed info + season stats for a player by their numeric person ID. ' +
      'If you only have a player name, call find_player first to get the person ID.',
    {
      person_id: z
        .number()
        .describe('Numeric person ID (get this from find_player tool)'),
      season: z
        .string()
        .optional()
        .describe('Season year for stats hydration (defaults to current year)')
    },
    async ({ person_id, season }) => {
      const s = season || currentSeasonYear();
      const data = await client.playerWithStats(person_id, s);
      const player = data.people?.[0];
      if (!player) return textContent(`No player found with ID ${person_id}.`);
      return jsonContent(`Player: ${player.fullName}`, player);
    }
  );

  server.tool(
    'search_player_on_team',
    "Search for a player by name within a specific team's roster. Requires a numeric team ID. " +
      'TIP: If you just want to find a player by name, use find_player instead — it does not require a team ID.',
    {
      team_id: z.number().describe(`Numeric team ID (${teamIdExamples()})`),
      name: z.string().describe('Player name or partial name to search for')
    },
    async ({ team_id, name }) => {
      const data = await client.teamRoster(team_id, 'fullRoster');
      const roster = data.roster || [];
      const q = name.toLowerCase();
      const matches = roster.filter((e) =>
        e.person?.fullName?.toLowerCase().includes(q)
      );
      if (matches.length === 0) {
        return textContent(
          `No players matching "${name}" found on team ${team_id}.`
        );
      }
      const lines = matches.map((e) => `${formatRosterEntry(e)}`);
      return textContent(
        `Players matching "${name}" on team ${team_id}:\n\n${lines.join('\n')}`
      );
    }
  );

  // ---------- Schedule & Games ----------

  server.tool(
    'get_games_today',
    'Get all MLB games scheduled for today with scores and status. Great for checking live games.',
    {
      sport_id: z
        .number()
        .optional()
        .describe('Sport ID: 1=MLB (default), 13=High-A, etc')
    },
    async ({ sport_id }) => {
      const date = todayDate();
      const data = await client.schedule({ sportId: sport_id ?? 1, date });
      const games = data.dates?.[0]?.games || [];
      if (games.length === 0)
        return textContent(`No games scheduled for today (${date}).`);
      const lines = games.map(formatGameSummary);
      return textContent(`Games for today (${date}):\n\n${lines.join('\n')}`);
    }
  );

  server.tool(
    'get_games_by_date',
    'Get all games for a specific date. Shows matchups, scores, game status, and gamePk IDs.',
    {
      date: z.string().describe('Date in YYYY-MM-DD format'),
      sport_id: z
        .number()
        .optional()
        .describe('Sport ID: 1=MLB (default), 13=High-A')
    },
    async ({ date, sport_id }) => {
      const d = toAPIDate(date);
      const data = await client.schedule({ sportId: sport_id ?? 1, date: d });
      const allGames = (data.dates || []).flatMap((dt) => dt.games || []);
      if (allGames.length === 0) return textContent(`No games found for ${d}.`);
      const lines = allGames.map(formatGameSummary);
      return textContent(`Games for ${d}:\n\n${lines.join('\n')}`);
    }
  );

  server.tool(
    'get_team_schedule',
    'Get upcoming or past games for a specific team. Returns gamePk IDs you can use with box score and play-by-play tools.',
    {
      team_id: z.number().describe(`Team ID (${teamIdExamples()})`),
      start_date: z
        .string()
        .optional()
        .describe('Start date YYYY-MM-DD (defaults to today)'),
      end_date: z
        .string()
        .optional()
        .describe('End date YYYY-MM-DD (defaults to 14 days from start)'),
      sport_id: z
        .number()
        .optional()
        .describe('Sport ID: 1=MLB (default), 13=High-A')
    },
    async ({ team_id, start_date, end_date, sport_id }) => {
      const start = start_date || todayDate();
      const endD =
        end_date ||
        toAPIDate(new Date(new Date(start).getTime() + 14 * 86400000));
      const data = await client.schedule({
        sportId: sport_id ?? 1,
        teamId: team_id,
        startDate: start,
        endDate: endD
      });
      const allGames = (data.dates || []).flatMap((dt) => dt.games || []);
      if (allGames.length === 0) {
        return textContent(
          `No games found for team ${team_id} between ${start} and ${endD}.`
        );
      }
      const lines = allGames.map(formatGameSummary);
      return textContent(
        `Schedule for team ${team_id} (${start} to ${endD}, ${allGames.length} games):\n\n${lines.join('\n')}`
      );
    }
  );

  // ---------- Live Game Data ----------

  server.tool(
    'get_game_feed',
    'Get the full live game feed for a game — includes scores, plays, decisions, boxscore, and more. ' +
      'This is the most comprehensive single-game endpoint.',
    {
      game_pk: z
        .number()
        .describe('Game PK identifier (get from schedule tools)')
    },
    async ({ game_pk }) => {
      const feed = await client.gameFeed(game_pk);
      const gd = feed.gameData || {};
      const ld = feed.liveData || {};
      const away = gd.teams?.away?.name || '?';
      const home = gd.teams?.home?.name || '?';
      const status = gd.status?.detailedState || '?';
      const linescore = ld.linescore || {};
      const awayRuns = linescore.teams?.away?.runs;
      const homeRuns = linescore.teams?.home?.runs;
      const score = awayRuns != null ? `${awayRuns}-${homeRuns}` : 'TBD';
      const inning = linescore.currentInning
        ? `${linescore.inningHalf || ''} ${linescore.currentInning}`
        : '';

      const summary = {
        game: `${away} vs ${home}`,
        score,
        status,
        inning: inning || undefined,
        venue: gd.venue?.name,
        weather: gd.weather,
        probablePitchers: gd.probablePitchers,
        decisions: ld.decisions,
        linescore: linescore.innings,
        currentPlay: ld.plays?.currentPlay,
        scoringPlays: ld.plays?.scoringPlays?.length || 0,
        totalPlays: ld.plays?.allPlays?.length || 0
      };
      return jsonContent(
        `Game Feed: ${away} vs ${home} — ${score} (${status})`,
        summary
      );
    }
  );

  server.tool(
    'get_box_score',
    'Get the box score for a game. Includes batting, pitching, and fielding stats for both teams.',
    { game_pk: z.number().describe('Game PK identifier') },
    async ({ game_pk }) => {
      const box = await client.boxScore(game_pk);
      return jsonContent(`Box Score for game ${game_pk}`, box);
    }
  );

  server.tool(
    'get_line_score',
    'Get the line score (inning-by-inning runs, hits, errors) for a game.',
    { game_pk: z.number().describe('Game PK identifier') },
    async ({ game_pk }) => {
      const ls = await client.lineScore(game_pk);
      return jsonContent(`Line Score for game ${game_pk}`, ls);
    }
  );

  server.tool(
    'get_play_by_play',
    'Get full play-by-play for a game. Every at-bat, pitch, and play event.',
    { game_pk: z.number().describe('Game PK identifier') },
    async ({ game_pk }) => {
      const pbp = await client.playByPlay(game_pk);
      const plays = pbp.allPlays || [];
      const scoring = plays.filter((p) => p.about?.isScoringPlay);
      const summary = {
        totalPlays: plays.length,
        scoringPlays: scoring.map((p) => ({
          inning: `${p.about?.halfInning || ''} ${p.about?.inning || ''}`,
          description: p.result?.description,
          awayScore: p.result?.awayScore,
          homeScore: p.result?.homeScore
        })),
        lastPlay:
          plays.length > 0
            ? {
                description: plays[plays.length - 1].result?.description,
                event: plays[plays.length - 1].result?.event
              }
            : null
      };
      return jsonContent(`Play-by-Play for game ${game_pk}`, summary);
    }
  );

  // ---------- Standings ----------

  server.tool(
    'get_standings',
    'Get current MLB standings by division. Shows wins, losses, PCT, games back, and streak for every team.',
    {
      season: z
        .string()
        .optional()
        .describe('Season year (defaults to current year)')
    },
    async ({ season }) => {
      const s = season || currentSeasonYear();
      const data = await client.standings(s);
      const records = data.records || [];
      const lines = [];
      for (const div of records) {
        const divName = div.division?.name || 'Unknown Division';
        lines.push(`\n--- ${divName} ---`);
        for (const tr of div.teamRecords || []) {
          lines.push(
            `${tr.team?.name || '?'} — ${tr.wins}W-${tr.losses}L ` +
              `${tr.winningPercentage || '?'} GB: ${tr.gamesBack || '-'} ` +
              `Streak: ${tr.streak?.streakCode || '?'}`
          );
        }
      }
      return textContent(`MLB Standings ${s}:${lines.join('\n')}`);
    }
  );

  // ---------- Player Stats ----------

  server.tool(
    'get_player_stats',
    "Get a player's season stats (batting, pitching, fielding). Requires a numeric person ID. " +
      'If you only have a player name, call find_player first to get the person ID.',
    {
      person_id: z
        .number()
        .describe('Numeric person ID (get this from find_player tool)'),
      season: z
        .string()
        .optional()
        .describe('Season year (defaults to current)')
    },
    async ({ person_id, season }) => {
      const s = season || currentSeasonYear();
      const data = await client.playerWithStats(person_id, s);
      const player = data.people?.[0];
      if (!player) return textContent(`No player found with ID ${person_id}.`);
      return jsonContent(
        `Stats for ${player.fullName} (${s})`,
        player.stats || []
      );
    }
  );

  // ---------- Team Stats & Leaders ----------

  server.tool(
    'get_team_stats',
    'Get aggregate team stats for a season (hitting or pitching).',
    {
      team_id: z.number().describe('Team ID'),
      season: z
        .string()
        .optional()
        .describe('Season year (defaults to current)'),
      group: z.string().optional().describe('"hitting" (default) or "pitching"')
    },
    async ({ team_id, season, group }) => {
      const s = season || currentSeasonYear();
      const g = group || 'hitting';
      const data = await client.teamStats(team_id, s, g);
      return jsonContent(`Team ${g} stats for ${team_id} (${s})`, data);
    }
  );

  server.tool(
    'get_team_leaders',
    'Get stat leaders on a specific team (e.g. home run leaders, ERA leaders).',
    {
      team_id: z.number().describe('Team ID'),
      season: z
        .string()
        .optional()
        .describe('Season year (defaults to current)'),
      category: z
        .string()
        .optional()
        .describe(
          'Stat category: "homeRuns" (default), "battingAverage", "earnedRunAverage", "strikeouts", etc'
        )
    },
    async ({ team_id, season, category }) => {
      const s = season || currentSeasonYear();
      const cat = category || 'homeRuns';
      const data = await client.teamLeaders(team_id, s, cat);
      return jsonContent(`Team ${team_id} leaders in ${cat} (${s})`, data);
    }
  );

  server.tool(
    'get_league_leaders',
    'Get MLB-wide stat leaders (HR leaders, batting avg leaders, ERA leaders, etc).',
    {
      category: z
        .string()
        .optional()
        .describe(
          'Stat category: "homeRuns" (default), "battingAverage", "earnedRunAverage", "strikeouts", "wins", "saves"'
        ),
      season: z.string().optional().describe('Season year'),
      stat_group: z
        .string()
        .optional()
        .describe('"hitting" (default) or "pitching"'),
      limit: z
        .number()
        .optional()
        .describe('Number of leaders to return (default 10)')
    },
    async ({ category, season, stat_group, limit }) => {
      const data = await client.statLeaders({
        leaderCategories: category || 'homeRuns',
        season: season || currentSeasonYear(),
        statGroup: stat_group || 'hitting',
        limit: limit || 10
      });
      return jsonContent('League Leaders', data);
    }
  );

  // ---------- Transactions ----------

  server.tool(
    'get_transactions',
    'Get recent MLB transactions (trades, signings, call-ups, DFAs, IL moves). ' +
      'Can filter by team.',
    {
      team_id: z.number().optional().describe('Filter by team ID'),
      start_date: z
        .string()
        .optional()
        .describe('Start date YYYY-MM-DD (defaults to 7 days ago)'),
      end_date: z
        .string()
        .optional()
        .describe('End date YYYY-MM-DD (defaults to today)')
    },
    async ({ team_id, start_date, end_date }) => {
      const end = end_date || todayDate();
      const start =
        start_date || toAPIDate(new Date(new Date().getTime() - 7 * 86400000));
      const data = await client.transactions({
        startDate: start,
        endDate: end,
        teamId: team_id
      });
      const txns = data.transactions || [];
      if (txns.length === 0) {
        return textContent(
          `No transactions found between ${start} and ${end}.`
        );
      }
      const lines = txns
        .slice(0, 50)
        .map(
          (t) =>
            `[${t.date || '?'}] ${t.person?.fullName || '?'} — ${t.typeDesc || t.description || '?'} ` +
            `(${t.fromTeam?.name || ''} → ${t.toTeam?.name || ''})`
        );
      const note =
        txns.length > 50 ? `\n\n... showing first 50 of ${txns.length}` : '';
      return textContent(
        `Transactions (${start} to ${end}):\n\n${lines.join('\n')}${note}`
      );
    }
  );

  // ---------- Venues ----------

  server.tool(
    'get_venues',
    'Get info on MLB stadiums and ballparks.',
    {},
    async () => {
      const data = await client.venues();
      const venues = data.venues || [];
      return jsonContent(`Venues (${venues.length})`, venues.slice(0, 50));
    }
  );

  // ---------- Season & Sport Info ----------

  server.tool(
    'get_current_season',
    'Get metadata about a season — start/end dates, all-star game, postseason dates.',
    {
      season: z
        .string()
        .optional()
        .describe('Season year (defaults to current)')
    },
    async ({ season }) => {
      const s = season || currentSeasonYear();
      const data = await client.season(s);
      return jsonContent(`Season ${s}`, data);
    }
  );

  server.tool(
    'get_sport_ids',
    'List all league levels with their sport IDs (MLB=1, AAA=11, AA=12, High-A=13, etc). ' +
      'Useful for querying minor league data.',
    {},
    async () => {
      const data = await client.sports();
      const sports = data.sports || [];
      const lines = sports.map((s) => `${s.id} = ${s.name} (${s.code || '?'})`);
      return textContent(`Sport IDs:\n\n${lines.join('\n')}`);
    }
  );

  return server;
}

// ── Startup ──────────────────────────────────────────────────────────

/**
 * Resolve CLI team arguments into tracked teams.
 *
 * Fetches the full team list from the MLB Stats API across all common
 * league levels (MLB, AAA, AA, High-A, Single-A), then fuzzy-matches
 * each CLI arg against that list.  Matched teams are converted via
 * buildTrackedTeam() and stored in the global registry via setTrackedTeams().
 *
 * Does nothing when args is empty (server runs in generic mode).
 *
 * @param {MLBStatsClient} client  HTTP client for the MLB Stats API
 * @param {string[]} args          Raw CLI arguments (team names, abbreviations, or IDs)
 */
async function resolveStartupTeams(client, args) {
  if (args.length === 0) return;

  // Fetch teams across all common league levels
  const sportIds = [1, 11, 12, 13, 14];
  const allTeams = [];
  for (const sid of sportIds) {
    try {
      const data = await client.teams(sid);
      if (data.teams) allTeams.push(...data.teams);
    } catch {
      // skip levels that fail
    }
  }

  const matched = resolveTeamArgs(args, allTeams);
  if (matched.length === 0) return;

  const teams = {};
  for (const apiTeam of matched) {
    const t = buildTrackedTeam(apiTeam);
    teams[t.key] = t;
  }
  setTrackedTeams(teams);
}

/**
 * Entry point.
 *
 * 1. Parse CLI args (team names / IDs)
 * 2. Resolve them against the MLB Stats API (populates tracked-teams registry)
 * 3. Build the MCP server (tools, resources, prompts — descriptions are dynamic)
 * 4. Connect via stdio transport
 */
async function main() {
  const args = process.argv.slice(2);
  const client = new MLBStatsClient();

  // Resolve team args before building server so descriptions are dynamic
  await resolveStartupTeams(client, args);

  const tracked = listTrackedTeams();
  if (args.length > 0 && tracked.length > 0) {
    const names = tracked.map((t) => `${t.name} (${t.key})`).join(', ');
    console.error(`Tracking: ${names}`);
  } else if (args.length > 0) {
    console.error('Warning: no teams could be resolved from arguments');
  }

  const server = buildServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MLB MCP Server failed to start:', err);
  process.exit(1);
});
