import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTeam,
  listTrackedTeams,
  getTrackedTeams,
  setTrackedTeams,
  buildTrackedTeam,
  resolveTeamArgs,
  levenshtein
} from '../src/teams.js';

// ── Helper: fake MLB API team objects ────────────────────────────────

const fakeSeaApi = {
  id: 136,
  name: 'Seattle Mariners',
  abbreviation: 'SEA',
  teamName: 'Mariners',
  locationName: 'Seattle',
  shortName: 'Seattle',
  sport: { id: 1, name: 'Major League Baseball' },
  league: { name: 'American League' },
  division: { name: 'AL West' }
};

const fakeAriApi = {
  id: 109,
  name: 'Arizona Diamondbacks',
  abbreviation: 'ARI',
  teamName: 'Diamondbacks',
  locationName: 'Phoenix',
  shortName: 'Arizona',
  sport: { id: 1, name: 'Major League Baseball' },
  league: { name: 'National League' },
  division: { name: 'NL West' }
};

const fakeHopsApi = {
  id: 419,
  name: 'Hillsboro Hops',
  abbreviation: 'HOP',
  teamName: 'Hops',
  locationName: 'Hillsboro',
  shortName: 'Hillsboro',
  sport: { id: 13, name: 'High-A' },
  league: { name: 'Northwest League' },
  division: { name: 'NWL West' }
};

const allFakeTeams = [fakeSeaApi, fakeAriApi, fakeHopsApi];

// Reset state before each test
beforeEach(() => {
  setTrackedTeams({});
});

// ── buildTrackedTeam ─────────────────────────────────────────────────

describe('buildTrackedTeam', () => {
  it('builds from an MLB API team object', () => {
    const t = buildTrackedTeam(fakeSeaApi);
    assert.equal(t.key, 'SEA');
    assert.equal(t.teamId, 136);
    assert.equal(t.sportId, 1);
    assert.equal(t.name, 'Seattle Mariners');
    assert.equal(t.league, 'MLB');
    assert.equal(t.division, 'AL West');
    assert.equal(t.city, 'Seattle');
  });

  it('builds MiLB team with level', () => {
    const t = buildTrackedTeam(fakeHopsApi);
    assert.equal(t.key, 'HOP');
    assert.equal(t.teamId, 419);
    assert.equal(t.sportId, 13);
    assert.equal(t.league, 'MiLB');
    assert.equal(t.level, 'High-A');
  });

  it('generates aliases from name, city, teamName, abbreviation, shortName', () => {
    const t = buildTrackedTeam(fakeSeaApi);
    assert.ok(t.aliases.includes('seattle mariners'));
    assert.ok(t.aliases.includes('seattle'));
    assert.ok(t.aliases.includes('mariners'));
    assert.ok(t.aliases.includes('sea'));
  });

  it('always produces an aliases array', () => {
    const t = buildTrackedTeam({ id: 999, abbreviation: 'TST' });
    assert.ok(Array.isArray(t.aliases));
    assert.ok(t.aliases.length > 0);
  });

  it('every team has a numeric teamId', () => {
    for (const api of allFakeTeams) {
      const t = buildTrackedTeam(api);
      assert.equal(typeof t.teamId, 'number');
    }
  });
});

// ── setTrackedTeams / getTrackedTeams ────────────────────────────────

describe('setTrackedTeams / getTrackedTeams', () => {
  it('starts empty', () => {
    assert.deepEqual(getTrackedTeams(), {});
  });

  it('set and get round-trips', () => {
    const sea = buildTrackedTeam(fakeSeaApi);
    setTrackedTeams({ SEA: sea });
    assert.equal(getTrackedTeams().SEA.teamId, 136);
  });

  it('replaces previous teams', () => {
    const sea = buildTrackedTeam(fakeSeaApi);
    const ari = buildTrackedTeam(fakeAriApi);
    setTrackedTeams({ SEA: sea });
    setTrackedTeams({ ARI: ari });
    assert.equal(getTrackedTeams().ARI.teamId, 109);
    assert.equal(getTrackedTeams().SEA, undefined);
  });
});

// ── resolveTeam (with dynamically set teams) ─────────────────────────

describe('resolveTeam', () => {
  beforeEach(() => {
    const teams = {};
    for (const api of allFakeTeams) {
      const t = buildTrackedTeam(api);
      teams[t.key] = t;
    }
    setTrackedTeams(teams);
  });

  it('resolves by uppercase key', () => {
    assert.equal(resolveTeam('SEA')?.name, 'Seattle Mariners');
    assert.equal(resolveTeam('ARI')?.name, 'Arizona Diamondbacks');
    assert.equal(resolveTeam('HOP')?.name, 'Hillsboro Hops');
  });

  it('resolves by lowercase key', () => {
    assert.equal(resolveTeam('sea')?.name, 'Seattle Mariners');
    assert.equal(resolveTeam('ari')?.name, 'Arizona Diamondbacks');
  });

  it('resolves by full name', () => {
    assert.equal(resolveTeam('seattle mariners')?.key, 'SEA');
    assert.equal(resolveTeam('arizona diamondbacks')?.key, 'ARI');
    assert.equal(resolveTeam('hillsboro hops')?.key, 'HOP');
  });

  it('resolves by city or teamName alias', () => {
    assert.equal(resolveTeam('seattle')?.key, 'SEA');
    assert.equal(resolveTeam('mariners')?.key, 'SEA');
    assert.equal(resolveTeam('diamondbacks')?.key, 'ARI');
    assert.equal(resolveTeam('hops')?.key, 'HOP');
  });

  it('is case insensitive for aliases', () => {
    assert.equal(resolveTeam('MARINERS')?.key, 'SEA');
    assert.equal(resolveTeam('Hops')?.key, 'HOP');
  });

  it('returns teamId for resolved teams', () => {
    assert.equal(resolveTeam('SEA')?.teamId, 136);
    assert.equal(resolveTeam('ARI')?.teamId, 109);
    assert.equal(resolveTeam('HOP')?.teamId, 419);
  });

  it('returns null for unknown teams', () => {
    assert.equal(resolveTeam('yankees'), null);
    assert.equal(resolveTeam(''), null);
    assert.equal(resolveTeam(null), null);
    assert.equal(resolveTeam(undefined), null);
  });

  it('handles whitespace', () => {
    assert.equal(resolveTeam('  SEA  ')?.name, 'Seattle Mariners');
  });

  it('returns null when no teams are tracked', () => {
    setTrackedTeams({});
    assert.equal(resolveTeam('SEA'), null);
  });
});

// ── listTrackedTeams ─────────────────────────────────────────────────

describe('listTrackedTeams', () => {
  beforeEach(() => {
    const teams = {};
    for (const api of allFakeTeams) {
      const t = buildTrackedTeam(api);
      teams[t.key] = t;
    }
    setTrackedTeams(teams);
  });

  it('returns all tracked teams with no filter', () => {
    const teams = listTrackedTeams();
    assert.equal(teams.length, 3);
  });

  it('filters by MLB league', () => {
    const mlb = listTrackedTeams('MLB');
    assert.equal(mlb.length, 2);
    assert.ok(mlb.some((t) => t.key === 'SEA'));
    assert.ok(mlb.some((t) => t.key === 'ARI'));
  });

  it('filters by MiLB league', () => {
    const milb = listTrackedTeams('MiLB');
    assert.equal(milb.length, 1);
    assert.equal(milb[0].key, 'HOP');
  });

  it('is case insensitive for league filter', () => {
    assert.equal(listTrackedTeams('mlb').length, 2);
    assert.equal(listTrackedTeams('milb').length, 1);
  });

  it('returns empty for non-existent league', () => {
    assert.equal(listTrackedTeams('NFL').length, 0);
  });

  it('returns empty when no teams are tracked', () => {
    setTrackedTeams({});
    assert.equal(listTrackedTeams().length, 0);
  });
});

// ── resolveTeamArgs ──────────────────────────────────────────────────

describe('resolveTeamArgs', () => {
  it('resolves by team name', () => {
    const matched = resolveTeamArgs(['mariners'], allFakeTeams);
    assert.equal(matched.length, 1);
    assert.equal(matched[0].id, 136);
  });

  it('resolves by numeric team ID', () => {
    const matched = resolveTeamArgs(['136'], allFakeTeams);
    assert.equal(matched.length, 1);
    assert.equal(matched[0].id, 136);
  });

  it('resolves by abbreviation', () => {
    const matched = resolveTeamArgs(['ARI'], allFakeTeams);
    assert.equal(matched.length, 1);
    assert.equal(matched[0].id, 109);
  });

  it('resolves by city', () => {
    const matched = resolveTeamArgs(['seattle'], allFakeTeams);
    assert.equal(matched.length, 1);
    assert.equal(matched[0].id, 136);
  });

  it('resolves by partial name', () => {
    const matched = resolveTeamArgs(['hillsboro'], allFakeTeams);
    assert.equal(matched.length, 1);
    assert.equal(matched[0].id, 419);
  });

  it('resolves multiple args', () => {
    const matched = resolveTeamArgs(['mariners', '109', 'hops'], allFakeTeams);
    assert.equal(matched.length, 3);
  });

  it('skips unresolvable args', () => {
    const matched = resolveTeamArgs(['nonexistent'], allFakeTeams);
    assert.equal(matched.length, 0);
  });

  it('skips empty strings', () => {
    const matched = resolveTeamArgs(['', '  ', 'mariners'], allFakeTeams);
    assert.equal(matched.length, 1);
  });

  it('is case insensitive', () => {
    const matched = resolveTeamArgs(['MARINERS'], allFakeTeams);
    assert.equal(matched.length, 1);
    assert.equal(matched[0].id, 136);
  });

  it('fuzzy-matches typos (missing letter)', () => {
    const matched = resolveTeamArgs(['Arizona Diamonbacks'], allFakeTeams);
    assert.equal(matched.length, 1);
    assert.equal(matched[0].id, 109);
  });

  it('fuzzy-matches typos (transposed letters)', () => {
    const matched = resolveTeamArgs(['Seattel Mariners'], allFakeTeams);
    assert.equal(matched.length, 1);
    assert.equal(matched[0].id, 136);
  });

  it('fuzzy-matches typos (extra letter)', () => {
    const matched = resolveTeamArgs(['Marinerss'], allFakeTeams);
    assert.equal(matched.length, 1);
    assert.equal(matched[0].id, 136);
  });

  it('fuzzy-matches typos (wrong letter)', () => {
    const matched = resolveTeamArgs(['Hillsboro Haps'], allFakeTeams);
    assert.equal(matched.length, 1);
    assert.equal(matched[0].id, 419);
  });
});

// ── levenshtein ──────────────────────────────────────────────────────

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    assert.equal(levenshtein('abc', 'abc'), 0);
  });

  it('returns length for empty vs non-empty', () => {
    assert.equal(levenshtein('', 'abc'), 3);
    assert.equal(levenshtein('abc', ''), 3);
  });

  it('counts single insertion', () => {
    assert.equal(levenshtein('diamondbacks', 'diamonbacks'), 1);
  });

  it('counts single substitution', () => {
    assert.equal(levenshtein('hops', 'haps'), 1);
  });

  it('counts transposition as 2 edits', () => {
    assert.equal(levenshtein('seattle', 'seattel'), 2);
  });
});
