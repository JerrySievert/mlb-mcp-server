/**
 * Shared formatting helpers used by the MCP tool handlers.
 * Tuned for the MLB Stats API (statsapi.mlb.com) response shapes.
 */

/**
 * Format a date to YYYY-MM-DD (what the MLB Stats API expects).
 * Accepts YYYY-MM-DD strings (returned as-is), longer date strings
 * (prefix-extracted), or Date objects (formatted via getFullYear/etc).
 *
 * @param {string|Date} input  Date string or Date object
 * @returns {string}           YYYY-MM-DD formatted date
 */
export function toAPIDate(input) {
  if (typeof input === 'string') {
    // Already in YYYY-MM-DD format
    const match = input.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const d = typeof input === 'string' ? new Date(input) : input;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Return today's date as YYYY-MM-DD.
 * @returns {string}
 */
export function todayDate() {
  return toAPIDate(new Date());
}

/**
 * Return the current year as a string (used as default season).
 * @returns {string}  e.g. "2026"
 */
export function currentSeasonYear() {
  return String(new Date().getFullYear());
}

/**
 * Compact an MLB Stats API game object into a concise one-line text summary.
 * Works with objects from the /schedule endpoint.
 *
 * Format: "Away vs Home — Score (Status) @ Venue DateTime [gamePk: ID]"
 *
 * @param {object} g  Game object from the MLB Stats API /schedule response
 * @returns {string}
 */
export function formatGameSummary(g) {
  const status = g.status?.detailedState || 'Unknown';
  const away = g.teams?.away?.team?.name || '?';
  const home = g.teams?.home?.team?.name || '?';
  const awayScore = g.teams?.away?.score;
  const homeScore = g.teams?.home?.score;
  const score =
    awayScore != null && homeScore != null
      ? `${awayScore}-${homeScore}`
      : 'TBD';
  const venue = g.venue?.name ? ` @ ${g.venue.name}` : '';
  const dt = formatGameDateTime(g);
  const gamePk = g.gamePk ? ` [gamePk: ${g.gamePk}]` : '';
  return `${away} vs ${home} — ${score} (${status})${venue} ${dt}${gamePk}`.trim();
}

/**
 * Format a game's date/time in the venue's local timezone.
 * Falls back to the raw UTC gameDate if timezone info is unavailable.
 */
export function formatGameDateTime(g) {
  const raw = g.gameDate;
  if (!raw) return '';

  const tz = g.venue?.timeZone;
  if (!tz?.id) return raw;

  if (g.status?.startTimeTBD) {
    return `${g.officialDate || raw.slice(0, 10)} (Time TBD ${tz.tz || tz.id})`;
  }

  try {
    const d = new Date(raw);
    const formatted = d.toLocaleString('en-US', {
      timeZone: tz.id,
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    return `${formatted} ${tz.tz || tz.id}`;
  } catch {
    return raw;
  }
}

/**
 * Compact a roster entry (from /teams/{id}/roster) into a one-liner.
 *
 * Format: "Name #Number Position Status (ID: personId)"
 *
 * @param {object} entry  Roster entry from the MLB Stats API /teams/{id}/roster response
 * @returns {string}
 */
export function formatRosterEntry(entry) {
  const name = entry.person?.fullName || '?';
  const num = entry.jerseyNumber ? `#${entry.jerseyNumber}` : '';
  const pos = entry.position?.abbreviation || '?';
  const statusDesc = entry.status?.description || '';
  const personId = entry.person?.id ? `(ID: ${entry.person.id})` : '';
  return `${name} ${num} ${pos} ${statusDesc} ${personId}`.trim();
}

/**
 * Build a plain-text content block for the MCP tool response.
 * This is the standard wrapper all tools use to return text to the LLM.
 *
 * @param {string} str  The text to return
 * @returns {{ content: Array<{ type: 'text', text: string }> }}
 */
export function textContent(str) {
  return { content: [{ type: 'text', text: str }] };
}

/**
 * JSON-stringify data into a text content block with a header line.
 * Used by tools that return structured data — the header gives the LLM
 * context and the JSON body provides the raw data.
 *
 * @param {string} header         Short description shown before the JSON
 * @param {object|string} data    Data to stringify (strings passed through as-is)
 * @returns {{ content: Array<{ type: 'text', text: string }> }}
 */
export function jsonContent(header, data) {
  const body = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return textContent(`${header}\n\n${body}`);
}
