/**
 * HTTP client for the free MLB Stats API (statsapi.mlb.com).
 * No API key required — all endpoints are publicly accessible.
 *
 * Provides typed methods for every API endpoint used by the MCP server:
 * teams, players, schedule, live game data, standings, stats, transactions,
 * venues, seasons, and sports.
 *
 * All methods return the parsed JSON response body directly.
 * Errors throw with the HTTP status and response body for debugging.
 *
 * Two API versions are used:
 *   - v1   (/api/v1/...)   — most endpoints
 *   - v1.1 (/api/v1.1/...) — live game feed only (richer data)
 */

/** @type {string} Base URL for v1 endpoints */
const BASE = 'https://statsapi.mlb.com/api';
const V1 = `${BASE}/v1`;
/** @type {string} Base URL for v1.1 endpoints (live game feed) */
const V11 = `${BASE}/v1.1`;

/**
 * Stateless HTTP client for the MLB Stats API.
 * Each method maps to a single API endpoint and returns parsed JSON.
 */
export class MLBStatsClient {
  // ─── internal fetch helper ──────────────────────────────────────

  /**
   * Fetch a URL and return parsed JSON.  Throws on non-2xx responses.
   * @param {string} url  Fully qualified API URL
   * @returns {Promise<object>}
   */
  async _get(url) {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`MLB Stats API error ${res.status} for ${url}: ${body}`);
    }
    return res.json();
  }

  // ─── Teams ──────────────────────────────────────────────────────

  /** All teams for a sport (1=MLB, 11=AAA, 12=AA, 13=High-A, 14=A) */
  teams(sportId = 1) {
    return this._get(`${V1}/teams?sportId=${sportId}`);
  }

  /** Single team by ID */
  team(teamId) {
    return this._get(`${V1}/teams/${teamId}`);
  }

  /** Team roster (rosterType: active, fullSeason, fullRoster, depthChart, etc) */
  teamRoster(teamId, rosterType = 'active') {
    return this._get(`${V1}/teams/${teamId}/roster?rosterType=${rosterType}`);
  }

  /** Team coaches */
  teamCoaches(teamId) {
    return this._get(`${V1}/teams/${teamId}/coaches`);
  }

  /** Team stats for a season */
  teamStats(teamId, season, group = 'hitting', stats = 'season') {
    return this._get(
      `${V1}/teams/${teamId}/stats?season=${season}&group=${group}&stats=${stats}`
    );
  }

  /** Team leaders in a stat category */
  teamLeaders(teamId, season, leaderCategories = 'homeRuns') {
    return this._get(
      `${V1}/teams/${teamId}/leaders?season=${season}&leaderCategories=${leaderCategories}`
    );
  }

  /** Team affiliates (minor league affiliates for an MLB team) */
  teamAffiliates(teamId) {
    return this._get(`${V1}/teams/affiliates?teamIds=${teamId}`);
  }

  // ─── Players / People ──────────────────────────────────────────

  /** Single person with optional hydrations */
  person(personId, hydrate) {
    const qs = hydrate ? `?hydrate=${encodeURIComponent(hydrate)}` : '';
    return this._get(`${V1}/people/${personId}${qs}`);
  }

  /** Player with current team + season stats */
  playerWithStats(personId, season) {
    const hydrate = `currentTeam,stats(group=[hitting,pitching,fielding],type=season,season=${season})`;
    return this._get(
      `${V1}/people/${personId}?hydrate=${encodeURIComponent(hydrate)}`
    );
  }

  /** Search for players by name. Returns matching people with IDs. */
  searchPeople(name, sportId) {
    const params = new URLSearchParams();
    params.set('names', name);
    if (sportId) params.set('sportId', sportId);
    return this._get(`${V1}/people/search?${params}`);
  }

  /** Free agents */
  freeAgents(season) {
    const qs = season ? `?season=${season}` : '';
    return this._get(`${V1}/people/freeAgents${qs}`);
  }

  // ─── Schedule & Games ──────────────────────────────────────────

  /** Schedule for a date range or specific date (sportId 1=MLB, 13=High-A, etc) */
  schedule({ sportId = 1, date, startDate, endDate, teamId, gameType } = {}) {
    const params = new URLSearchParams();
    params.set('sportId', sportId);
    if (date) params.set('date', date);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (teamId) params.set('teamId', teamId);
    if (gameType) params.set('gameType', gameType);
    params.set('hydrate', 'team,venue');
    return this._get(`${V1}/schedule?${params}`);
  }

  // ─── Live Game Data ────────────────────────────────────────────

  /** Full live game feed (scores, plays, boxscore, everything) */
  gameFeed(gamePk) {
    return this._get(`${V11}/game/${gamePk}/feed/live`);
  }

  /** Box score for a game */
  boxScore(gamePk) {
    return this._get(`${V1}/game/${gamePk}/boxscore`);
  }

  /** Line score for a game */
  lineScore(gamePk) {
    return this._get(`${V1}/game/${gamePk}/linescore`);
  }

  /** Play-by-play for a game */
  playByPlay(gamePk) {
    return this._get(`${V1}/game/${gamePk}/playByPlay`);
  }

  /** Win probability for a game */
  winProbability(gamePk) {
    return this._get(`${V1}/game/${gamePk}/winProbability`);
  }

  /** Game content (editorial, media, highlights) */
  gameContent(gamePk) {
    return this._get(`${V1}/game/${gamePk}/content`);
  }

  // ─── Standings ─────────────────────────────────────────────────

  /** Standings (leagueId: 103=AL, 104=NL) */
  standings(season, leagueId = '103,104') {
    return this._get(`${V1}/standings?leagueId=${leagueId}&season=${season}`);
  }

  // ─── Stats & Leaders ──────────────────────────────────────────

  /** Stat leaders across the league */
  statLeaders({
    leaderCategories = 'homeRuns',
    season,
    sportId = 1,
    statGroup = 'hitting',
    limit = 10
  } = {}) {
    const params = new URLSearchParams();
    params.set('leaderCategories', leaderCategories);
    params.set('sportId', sportId);
    params.set('statGroup', statGroup);
    params.set('limit', limit);
    if (season) params.set('season', season);
    return this._get(`${V1}/stats/leaders?${params}`);
  }

  // ─── Transactions ──────────────────────────────────────────────

  /** Transactions (trades, signings, DFA, call-ups, etc) */
  transactions({ startDate, endDate, teamId } = {}) {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (teamId) params.set('teamId', teamId);
    return this._get(`${V1}/transactions?${params}`);
  }

  // ─── Venues ────────────────────────────────────────────────────

  /** All venues */
  venues() {
    return this._get(`${V1}/venues`);
  }

  // ─── Seasons ───────────────────────────────────────────────────

  /** Current season info */
  season(seasonId, sportId = 1) {
    return this._get(`${V1}/seasons/${seasonId}?sportId=${sportId}`);
  }

  // ─── Sports ────────────────────────────────────────────────────

  /** List all sports (MLB, AAA, AA, High-A, etc) with IDs */
  sports() {
    return this._get(`${V1}/sports`);
  }
}
