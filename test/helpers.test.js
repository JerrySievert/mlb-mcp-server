import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  toAPIDate,
  todayDate,
  currentSeasonYear,
  formatGameSummary,
  formatGameDateTime,
  formatRosterEntry,
  textContent,
  jsonContent
} from '../src/helpers.js';

describe('toAPIDate', () => {
  it('passes through YYYY-MM-DD strings unchanged', () => {
    assert.equal(toAPIDate('2025-07-04'), '2025-07-04');
  });

  it('extracts YYYY-MM-DD from longer strings', () => {
    assert.equal(toAPIDate('2025-07-04T19:10:00Z'), '2025-07-04');
  });

  it('handles Date objects', () => {
    const d = new Date(2025, 6, 4); // July 4 2025 local time
    assert.equal(toAPIDate(d), '2025-07-04');
  });

  it('preserves all 12 months', () => {
    for (let m = 1; m <= 12; m++) {
      const dateStr = `2025-${String(m).padStart(2, '0')}-15`;
      assert.equal(toAPIDate(dateStr), dateStr);
    }
  });

  it('preserves leading zeros on days', () => {
    assert.equal(toAPIDate('2025-03-05'), '2025-03-05');
  });
});

describe('todayDate', () => {
  it('returns a YYYY-MM-DD string', () => {
    assert.match(todayDate(), /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('currentSeasonYear', () => {
  it('returns a 4-digit year string', () => {
    const year = currentSeasonYear();
    assert.match(year, /^\d{4}$/);
    assert.equal(year, String(new Date().getFullYear()));
  });
});

describe('formatGameSummary', () => {
  it('formats a completed game from MLB Stats API shape', () => {
    const game = {
      gamePk: 777245,
      gameDate: '2025-07-04T19:10:00Z',
      status: { detailedState: 'Final' },
      teams: {
        away: { team: { name: 'Seattle Mariners' }, score: 5 },
        home: { team: { name: 'Arizona Diamondbacks' }, score: 3 }
      },
      venue: { name: 'Chase Field' }
    };
    const result = formatGameSummary(game);
    assert.ok(result.includes('Seattle Mariners vs Arizona Diamondbacks'));
    assert.ok(result.includes('5-3'));
    assert.ok(result.includes('Final'));
    assert.ok(result.includes('Chase Field'));
    assert.ok(result.includes('777245'));
  });

  it('formats a scheduled game with TBD score', () => {
    const game = {
      gamePk: 999,
      status: { detailedState: 'Scheduled' },
      teams: {
        away: { team: { name: 'Mariners' } },
        home: { team: { name: 'D-backs' } }
      }
    };
    const result = formatGameSummary(game);
    assert.ok(result.includes('TBD'));
    assert.ok(result.includes('Scheduled'));
  });

  it('handles missing fields gracefully', () => {
    const game = {};
    const result = formatGameSummary(game);
    assert.ok(result.includes('?'));
    assert.ok(result.includes('TBD'));
  });
});

describe('formatGameDateTime', () => {
  it('converts UTC gameDate to venue local time', () => {
    const game = {
      gameDate: '2025-07-02T01:35:00Z',
      officialDate: '2025-07-01',
      status: { detailedState: 'Final', startTimeTBD: false },
      venue: {
        name: 'PK Park',
        timeZone: { id: 'America/Los_Angeles', offset: -7, offsetAtGameTime: -7, tz: 'PDT' }
      }
    };
    const result = formatGameDateTime(game);
    assert.ok(result.includes('Jul 1'), `expected local date Jul 1, got: ${result}`);
    assert.ok(result.includes('6:35 PM'), `expected 6:35 PM, got: ${result}`);
    assert.ok(result.includes('PDT'), `expected PDT timezone, got: ${result}`);
  });

  it('shows Time TBD when startTimeTBD is true', () => {
    const game = {
      gameDate: '2025-07-02T01:35:00Z',
      officialDate: '2025-07-01',
      status: { detailedState: 'Scheduled', startTimeTBD: true },
      venue: {
        name: 'PK Park',
        timeZone: { id: 'America/Los_Angeles', tz: 'PDT' }
      }
    };
    const result = formatGameDateTime(game);
    assert.ok(result.includes('Time TBD'));
    assert.ok(result.includes('2025-07-01'));
  });

  it('falls back to raw UTC when no timezone info', () => {
    const game = {
      gameDate: '2025-07-02T01:35:00Z',
      venue: { name: 'Unknown Park' }
    };
    const result = formatGameDateTime(game);
    assert.strictEqual(result, '2025-07-02T01:35:00Z');
  });

  it('handles Eastern timezone correctly', () => {
    const game = {
      gameDate: '2025-07-02T23:05:00Z',
      officialDate: '2025-07-02',
      status: { detailedState: 'Scheduled', startTimeTBD: false },
      venue: {
        name: 'Yankee Stadium',
        timeZone: { id: 'America/New_York', offset: -4, offsetAtGameTime: -4, tz: 'EDT' }
      }
    };
    const result = formatGameDateTime(game);
    assert.ok(result.includes('7:05 PM'), `expected 7:05 PM, got: ${result}`);
    assert.ok(result.includes('EDT'), `expected EDT timezone, got: ${result}`);
  });
});

describe('formatRosterEntry', () => {
  it('formats a full roster entry', () => {
    const entry = {
      person: { id: 592450, fullName: 'Julio Rodriguez' },
      jerseyNumber: '44',
      position: { abbreviation: 'CF' },
      status: { description: 'Active' }
    };
    const result = formatRosterEntry(entry);
    assert.ok(result.includes('Julio Rodriguez'));
    assert.ok(result.includes('#44'));
    assert.ok(result.includes('CF'));
    assert.ok(result.includes('Active'));
    assert.ok(result.includes('592450'));
  });

  it('handles missing fields', () => {
    const entry = { person: {} };
    const result = formatRosterEntry(entry);
    assert.ok(result.includes('?'));
  });
});

describe('textContent', () => {
  it('wraps string in MCP content format', () => {
    const result = textContent('hello');
    assert.deepEqual(result, {
      content: [{ type: 'text', text: 'hello' }]
    });
  });
});

describe('jsonContent', () => {
  it('produces a header + JSON body', () => {
    const result = jsonContent('Title', { a: 1 });
    assert.equal(result.content.length, 1);
    assert.ok(result.content[0].text.startsWith('Title'));
    assert.ok(result.content[0].text.includes('"a": 1'));
  });

  it('handles string data without re-stringifying', () => {
    const result = jsonContent('Title', 'raw string');
    assert.ok(result.content[0].text.includes('raw string'));
  });
});
