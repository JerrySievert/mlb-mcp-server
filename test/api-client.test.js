import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { MLBStatsClient } from '../src/api-client.js';

describe('MLBStatsClient', () => {
  let client;
  let fetchMock;

  beforeEach(() => {
    client = new MLBStatsClient();
    fetchMock = mock.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ mocked: true })
      })
    );
    globalThis.fetch = fetchMock;
  });

  function lastUrl() {
    return fetchMock.mock.calls[0].arguments[0];
  }

  // ─── Teams ────────────────────────────────────────────────────

  describe('teams', () => {
    it('defaults to sportId=1 (MLB)', async () => {
      await client.teams();
      assert.ok(lastUrl().includes('/teams?sportId=1'));
    });

    it('accepts a custom sportId', async () => {
      await client.teams(13);
      assert.ok(lastUrl().includes('/teams?sportId=13'));
    });
  });

  describe('team', () => {
    it('includes team ID in path', async () => {
      await client.team(136);
      assert.ok(lastUrl().includes('/teams/136'));
    });
  });

  describe('teamRoster', () => {
    it('includes team ID and rosterType', async () => {
      await client.teamRoster(136, 'active');
      const url = lastUrl();
      assert.ok(url.includes('/teams/136/roster'));
      assert.ok(url.includes('rosterType=active'));
    });

    it('defaults to active roster', async () => {
      await client.teamRoster(136);
      assert.ok(lastUrl().includes('rosterType=active'));
    });
  });

  describe('teamStats', () => {
    it('includes all parameters', async () => {
      await client.teamStats(136, '2025', 'pitching', 'season');
      const url = lastUrl();
      assert.ok(url.includes('/teams/136/stats'));
      assert.ok(url.includes('season=2025'));
      assert.ok(url.includes('group=pitching'));
    });
  });

  describe('teamLeaders', () => {
    it('includes team ID, season, and category', async () => {
      await client.teamLeaders(136, '2025', 'homeRuns');
      const url = lastUrl();
      assert.ok(url.includes('/teams/136/leaders'));
      assert.ok(url.includes('season=2025'));
      assert.ok(url.includes('leaderCategories=homeRuns'));
    });
  });

  describe('teamAffiliates', () => {
    it('includes teamIds param', async () => {
      await client.teamAffiliates(109);
      assert.ok(lastUrl().includes('teamIds=109'));
    });
  });

  // ─── Players ──────────────────────────────────────────────────

  describe('person', () => {
    it('includes person ID', async () => {
      await client.person(592450);
      assert.ok(lastUrl().includes('/people/592450'));
    });

    it('adds hydrate when provided', async () => {
      await client.person(592450, 'currentTeam');
      assert.ok(lastUrl().includes('hydrate=currentTeam'));
    });
  });

  describe('playerWithStats', () => {
    it('hydrates with stats and season', async () => {
      await client.playerWithStats(592450, '2025');
      const url = lastUrl();
      assert.ok(url.includes('/people/592450'));
      assert.ok(url.includes('season%3D2025') || url.includes('season=2025'));
    });
  });

  describe('searchPeople', () => {
    it('includes the name in the query string', async () => {
      await client.searchPeople('Julio Rodriguez');
      const url = lastUrl();
      assert.ok(url.includes('/people/search'));
      assert.ok(
        url.includes('names=Julio+Rodriguez') ||
          url.includes('names=Julio%20Rodriguez')
      );
    });

    it('includes sportId when provided', async () => {
      await client.searchPeople('Rodriguez', 1);
      const url = lastUrl();
      assert.ok(url.includes('sportId=1'));
    });

    it('omits sportId when not provided', async () => {
      await client.searchPeople('Carroll');
      const url = lastUrl();
      assert.ok(!url.includes('sportId'));
    });
  });

  describe('freeAgents', () => {
    it('hits freeAgents endpoint', async () => {
      await client.freeAgents();
      assert.ok(lastUrl().includes('/people/freeAgents'));
    });
  });

  // ─── Schedule ─────────────────────────────────────────────────

  describe('schedule', () => {
    it('includes sportId and date', async () => {
      await client.schedule({ sportId: 1, date: '2025-07-04' });
      const url = lastUrl();
      assert.ok(url.includes('/schedule'));
      assert.ok(url.includes('sportId=1'));
      assert.ok(url.includes('date=2025-07-04'));
    });

    it('includes teamId when provided', async () => {
      await client.schedule({ teamId: 136 });
      assert.ok(lastUrl().includes('teamId=136'));
    });

    it('includes date range params', async () => {
      await client.schedule({ startDate: '2025-07-01', endDate: '2025-07-14' });
      const url = lastUrl();
      assert.ok(url.includes('startDate=2025-07-01'));
      assert.ok(url.includes('endDate=2025-07-14'));
    });
  });

  // ─── Live Game Data ───────────────────────────────────────────

  describe('gameFeed', () => {
    it('uses v1.1 base URL', async () => {
      await client.gameFeed(777245);
      const url = lastUrl();
      assert.ok(url.includes('/v1.1/game/777245/feed/live'));
    });
  });

  describe('boxScore', () => {
    it('includes gamePk', async () => {
      await client.boxScore(777245);
      assert.ok(lastUrl().includes('/game/777245/boxscore'));
    });
  });

  describe('lineScore', () => {
    it('includes gamePk', async () => {
      await client.lineScore(777245);
      assert.ok(lastUrl().includes('/game/777245/linescore'));
    });
  });

  describe('playByPlay', () => {
    it('includes gamePk', async () => {
      await client.playByPlay(777245);
      assert.ok(lastUrl().includes('/game/777245/playByPlay'));
    });
  });

  describe('winProbability', () => {
    it('includes gamePk', async () => {
      await client.winProbability(777245);
      assert.ok(lastUrl().includes('/game/777245/winProbability'));
    });
  });

  describe('gameContent', () => {
    it('includes gamePk', async () => {
      await client.gameContent(777245);
      assert.ok(lastUrl().includes('/game/777245/content'));
    });
  });

  // ─── Standings ────────────────────────────────────────────────

  describe('standings', () => {
    it('includes season and leagueId', async () => {
      await client.standings('2025');
      const url = lastUrl();
      assert.ok(url.includes('/standings'));
      assert.ok(url.includes('season=2025'));
      assert.ok(
        url.includes('leagueId=103%2C104') || url.includes('leagueId=103,104')
      );
    });
  });

  // ─── Stats & Leaders ─────────────────────────────────────────

  describe('statLeaders', () => {
    it('includes all parameters', async () => {
      await client.statLeaders({
        leaderCategories: 'battingAverage',
        season: '2025',
        statGroup: 'hitting',
        limit: 5
      });
      const url = lastUrl();
      assert.ok(url.includes('/stats/leaders'));
      assert.ok(url.includes('leaderCategories=battingAverage'));
      assert.ok(url.includes('season=2025'));
      assert.ok(url.includes('limit=5'));
    });
  });

  // ─── Transactions ─────────────────────────────────────────────

  describe('transactions', () => {
    it('includes date range and teamId', async () => {
      await client.transactions({
        startDate: '2025-07-01',
        endDate: '2025-07-04',
        teamId: 136
      });
      const url = lastUrl();
      assert.ok(url.includes('/transactions'));
      assert.ok(url.includes('startDate=2025-07-01'));
      assert.ok(url.includes('endDate=2025-07-04'));
      assert.ok(url.includes('teamId=136'));
    });
  });

  // ─── Venues ───────────────────────────────────────────────────

  describe('venues', () => {
    it('hits venues endpoint', async () => {
      await client.venues();
      assert.ok(lastUrl().includes('/venues'));
    });
  });

  // ─── Season & Sports ──────────────────────────────────────────

  describe('season', () => {
    it('includes season and sportId', async () => {
      await client.season('2025');
      const url = lastUrl();
      assert.ok(url.includes('/seasons/2025'));
      assert.ok(url.includes('sportId=1'));
    });
  });

  describe('sports', () => {
    it('hits sports endpoint', async () => {
      await client.sports();
      assert.ok(lastUrl().includes('/sports'));
    });
  });

  // ─── Error handling ───────────────────────────────────────────

  describe('error handling', () => {
    it('throws on non-OK response', async () => {
      globalThis.fetch = mock.fn(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          text: () => Promise.resolve('Not Found')
        })
      );
      await assert.rejects(() => client.teams(), /MLB Stats API error 404/);
    });
  });
});
