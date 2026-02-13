/**
 * Dynamic tracked-team registry.
 *
 * Teams are populated at startup from CLI args by resolving names/IDs
 * against the MLB Stats API.  When no args are given the server runs
 * in "generic" mode with an empty tracked-teams list — every tool
 * still works, there's just no pre-configured shortcut layer.
 *
 * sportId values:  1 = MLB, 11 = AAA, 12 = AA, 13 = High-A, 14 = Single-A
 */

// ── Mutable state ────────────────────────────────────────────────────

/**
 * The in-memory registry of tracked teams, keyed by uppercase abbreviation
 * (e.g. "SEA", "ARI").  Starts empty and is populated at startup via
 * setTrackedTeams() after CLI args are resolved against the API.
 * @type {Record<string, object>}
 */
let trackedTeams = {};

// ── Public API ───────────────────────────────────────────────────────

/**
 * Replace the entire tracked-teams map.
 * @param {Record<string, object>} teams  keyed by uppercase abbreviation
 */
export function setTrackedTeams(teams) {
  trackedTeams = teams;
}

/**
 * Return the current tracked-teams map (may be empty).
 */
export function getTrackedTeams() {
  return trackedTeams;
}

/**
 * Build a tracked-team object from an MLB Stats API team record
 * (the shape returned by /api/v1/teams).
 *
 * Generates lowercase aliases from every available name field so that
 * resolveTeam() can match user input like "mariners", "seattle", or "sea".
 *
 * @param {object} apiTeam  Raw team object from the MLB Stats API
 * @returns {{
 *   key: string,       // uppercase abbreviation, e.g. "SEA"
 *   teamId: number,    // MLB Stats API team ID
 *   sportId: number,   // 1=MLB, 11=AAA, 12=AA, 13=High-A, 14=Single-A
 *   name: string,      // full name, e.g. "Seattle Mariners"
 *   league: string,    // "MLB" or "MiLB"
 *   level?: string,    // minor league level name (e.g. "High-A"), omitted for MLB
 *   division?: string, // division name, e.g. "AL West"
 *   city?: string,     // city name, e.g. "Seattle"
 *   aliases: string[]  // lowercase strings for fuzzy matching
 * }}
 */
export function buildTrackedTeam(apiTeam) {
  const abbr = (apiTeam.abbreviation || '???').toUpperCase();
  const name = apiTeam.name || apiTeam.teamName || abbr;
  const city = apiTeam.locationName || '';
  const teamName = apiTeam.teamName || '';

  // Generate useful aliases for fuzzy matching
  const aliases = new Set();
  aliases.add(name.toLowerCase());
  if (city) aliases.add(city.toLowerCase());
  if (teamName) aliases.add(teamName.toLowerCase());
  aliases.add(abbr.toLowerCase());
  if (apiTeam.shortName) aliases.add(apiTeam.shortName.toLowerCase());

  const sportId = apiTeam.sport?.id ?? 1;
  const level = sportId === 1 ? undefined : apiTeam.sport?.name || undefined;

  return {
    key: abbr,
    teamId: apiTeam.id,
    sportId,
    name,
    league: sportId === 1 ? 'MLB' : 'MiLB',
    level,
    division: apiTeam.division?.name || undefined,
    city: city || undefined,
    aliases: [...aliases]
  };
}

/**
 * Resolve a free-text team name or abbreviation to one of the tracked
 * team objects.  Tries direct key lookup first (e.g. "SEA"), then
 * scans aliases for an exact lowercase match.
 *
 * @param {string|null|undefined} input  User-provided team identifier
 * @returns {object|null}  The tracked team object, or null if not found
 */
export function resolveTeam(input) {
  if (!input) return null;
  const q = input.trim().toLowerCase();

  // Direct key match first
  const upper = q.toUpperCase();
  if (trackedTeams[upper]) return trackedTeams[upper];

  // Alias search
  for (const team of Object.values(trackedTeams)) {
    if (team.aliases.some((a) => a === q)) return team;
  }
  return null;
}

/**
 * Return all tracked teams as an array, optionally filtered by league.
 *
 * @param {string} [league]  "MLB" or "MiLB" (case-insensitive); omit for all
 * @returns {object[]}
 */
export function listTrackedTeams(league) {
  const teams = Object.values(trackedTeams);
  if (!league) return teams;
  return teams.filter((t) => t.league.toLowerCase() === league.toLowerCase());
}

/**
 * Compute the Levenshtein edit distance between two strings.
 *
 * Uses the classic dynamic-programming approach with an (m+1)×(n+1) matrix.
 * Each cell dp[i][j] holds the minimum number of single-character edits
 * (insertions, deletions, or substitutions) needed to transform a[0..i-1]
 * into b[0..j-1].
 *
 * Used as a fallback in fuzzyScore() when exact and substring matching fail,
 * so typos like "Diamonbacks" still resolve to "Diamondbacks".
 *
 * @param {string} a  First string
 * @param {string} b  Second string
 * @returns {number}   Edit distance (0 = identical)
 */
export function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;

  // dp[i][j] = edit distance between a[0..i-1] and b[0..j-1]
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1));

  // Base cases: transforming to/from empty string
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Fill the matrix: each cell is the min of insert, delete, or substitute
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] // chars match — no edit
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]); // delete, insert, substitute
    }
  }
  return dp[m][n];
}

/**
 * Score how well a lowercase query matches an API team object.
 * Lower score = better match.  Returns Infinity if nothing is close enough.
 *
 * The function compares the query against five team fields: name, abbreviation,
 * locationName, teamName, and shortName.
 *
 * Matching is done in three passes, each progressively more tolerant:
 *
 *   Pass 1 — Exact match (score 0):
 *     "ari" exactly equals the abbreviation "ari".
 *
 *   Pass 2 — Substring match (score 0.5 or 1):
 *     Score depends on length similarity between query and field.
 *     If the shorter string is ≥ 60% the length of the longer one, score 0.5
 *     (close match like "hops" in "hops").  Otherwise score 1 (loose match
 *     like "ari" inside "mariners" — penalized so exact abbreviation wins).
 *     Returns immediately at 0.5 to avoid unnecessary edit-distance work.
 *
 *   Pass 3 — Levenshtein edit distance (score 2 + distance):
 *     Catches typos.  The maximum allowed edits scale with query length:
 *       - ≤ 4 chars:  1 edit   (e.g. "haps" → "hops")
 *       - 5–8 chars:  2 edits  (e.g. "seattel" → "seattle")
 *       - > 8 chars:  up to 30% of query length
 *     Score is 2 + d so even the best fuzzy match (d=1 → score 3) always
 *     loses to an exact or close substring match.
 *
 * @param {string} query  Lowercase, trimmed user input
 * @param {object} team   Raw MLB Stats API team object
 * @returns {number}       Match score (lower is better; Infinity = no match)
 */
function fuzzyScore(query, team) {
  const fields = [
    team.name,
    team.abbreviation,
    team.locationName,
    team.teamName,
    team.shortName
  ]
    .filter(Boolean)
    .map((s) => s.toLowerCase());

  const maxEdits =
    query.length <= 4
      ? 1
      : query.length <= 8
        ? 2
        : Math.ceil(query.length * 0.3);

  // Pass 1: exact match — best possible score
  for (const f of fields) {
    if (f === query) return 0;
  }
  // Pass 2: substring — scored by length similarity so "ari"="ari" beats "ari" in "mariners"
  let best = Infinity;
  for (const f of fields) {
    if (f.includes(query) || query.includes(f)) {
      const shorter = Math.min(f.length, query.length);
      const longer = Math.max(f.length, query.length);
      const score = shorter / longer >= 0.6 ? 0.5 : 1;
      if (score < best) best = score;
    }
  }
  if (best <= 0.5) return best;
  // Pass 3: edit distance — fallback for typos
  for (const f of fields) {
    const d = levenshtein(query, f);
    if (d <= maxEdits) {
      const score = 2 + d;
      if (score < best) best = score;
    }
  }
  return best;
}

/**
 * Resolve CLI team args against a full list of API team objects.
 *
 * For each arg, tries in order:
 *   1. Numeric team ID (e.g. "136" → team with id 136)
 *   2. fuzzyScore() against all teams — picks the lowest-scoring match
 *
 * Logs to stderr when a fuzzy (edit-distance) match is used, or when
 * an arg can't be resolved at all.
 *
 * @param {string[]} args          CLI arguments (team names, abbreviations, or IDs)
 * @param {object[]} allApiTeams   All teams from the MLB Stats API
 * @returns {object[]}             Matched API team objects (same shape as input teams)
 */
export function resolveTeamArgs(args, allApiTeams) {
  const matched = [];

  for (const arg of args) {
    const q = arg.trim().toLowerCase();
    if (!q) continue;

    // Try numeric team ID first
    const numId = Number(q);
    if (!isNaN(numId)) {
      const byId = allApiTeams.find((t) => t.id === numId);
      if (byId) {
        matched.push(byId);
        continue;
      }
    }

    // Score every team, pick the best match
    let bestTeam = null;
    let bestScore = Infinity;
    for (const t of allApiTeams) {
      const s = fuzzyScore(q, t);
      if (s < bestScore) {
        bestScore = s;
        bestTeam = t;
      }
    }

    if (bestTeam && bestScore < Infinity) {
      if (bestScore > 0.5) {
        console.error(
          `Fuzzy-matched "${arg}" → ${bestTeam.name} (edit distance: ${bestScore})`
        );
      }
      matched.push(bestTeam);
    } else {
      console.error(`Warning: could not resolve team "${arg}" — skipping`);
    }
  }

  return matched;
}
