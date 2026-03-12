import { getTimeElapsed } from './../lib/date_time';
import { Log } from './../lib/log';
import { Site } from './../site';
import path from "path";
import { Event, Fixture, FullFixture, HistoricalFixture, Odds } from "./../model/sporty";
import { existsSync, mkdirSync } from 'fs';
import { SportyHelpers } from './sporty_helpers';
import { DatabaseSync } from 'node:sqlite';
import { PromptEngine } from './prompt';
import { SofascoreEngine } from './sofascore';
import { tennisWinnerScore } from './../lib/sportylib';

const SLUG = "EVENTS";
const WEIGHT = 3;
const EVENT_DURATION = 1000 * 60 * 60 * 2; //2 Hours
const MAX_RESULT_RETRIES = 3;

export class EventsProcessor {

    private static dataDirectory = path.join(Site.ROOT, ".data");
    // private static eventsDirectory = path.join(Site.ROOT, ".data", "events");
    // private static seenEventsFile = path.join(EventsProcessor.dataDirectory, "seen_events.json");
    private static databaseFile = path.join(EventsProcessor.dataDirectory, "predicate.db");
    private static db: DatabaseSync;

    private static _resultEngine: any = null;
    private static getResultEngine = async () => {
        if (!EventsProcessor._resultEngine) {
            const { ResultEngine } = await import("./result");
            EventsProcessor._resultEngine = ResultEngine;
        }
        return EventsProcessor._resultEngine;
    };

    static start = async () => {
        if (!existsSync(EventsProcessor.dataDirectory)) {
            mkdirSync(EventsProcessor.dataDirectory, { recursive: true });
        }

        EventsProcessor.db = new DatabaseSync(EventsProcessor.databaseFile);

        // Initialize Schema
        EventsProcessor.db.exec(`
            CREATE TABLE IF NOT EXISTS fixtures (
                event_id TEXT NOT NULL,
                game_id TEXT NOT NULL,
                league TEXT NOT NULL,
                home TEXT NOT NULL,
                away TEXT NOT NULL,
                start_time INTEGER NOT NULL,

                -- Odds
                home_win REAL,
                away_win REAL,

                -- Results
                home_goals INTEGER,
                away_goals INTEGER,

                -- Engine metadata
                score REAL DEFAULT 0,
                home_score REAL DEFAULT 0,
                away_score REAL DEFAULT 0,
                result_checked_count INTEGER DEFAULT 0,

                -- LLM
                llm_attempted INTEGER DEFAULT 0,
                has_verdict INTEGER DEFAULT 0,
                turned_off INTEGER DEFAULT 1,
                llm_winner INTEGER DEFAULT 0,

                PRIMARY KEY (event_id)
            );

            CREATE TABLE IF NOT EXISTS ai_verdicts (
                event_id TEXT NOT NULL,
                extracted_data TEXT,
                verdict TEXT,
                PRIMARY KEY (event_id),
                FOREIGN KEY (event_id) REFERENCES fixtures(event_id)
            );
        `);

        EventsProcessor.run();
        return true;
    }

    static stop = async () => {
        try {
            EventsProcessor.db.close();
        } catch (error) {

        }
        return true;
    }

    private static eventAlreadyExists = (eventId: string): Promise<boolean> => {
        return new Promise((resolve, reject) => {
            try {
                const stmt = EventsProcessor.db.prepare(`
                    SELECT 1 FROM fixtures WHERE event_id = ? LIMIT 1
                `);
                const row = stmt.get(eventId);
                resolve(!!row); // true if row exists, false otherwise
            } catch (err) {
                reject(err);
            }
        });
    };

    private static eventAlreadyLLMTested = (eventId: string): Promise<boolean> => {
        return new Promise((resolve, reject) => {
            try {
                const stmt = EventsProcessor.db.prepare(`
                    SELECT 1 FROM fixtures WHERE event_id = ? AND llm_attempted = 1 LIMIT 1
                `);
                const row = stmt.get(eventId);
                resolve(!!row); // true if row exists, false otherwise
            } catch (err) {
                reject(err);
            }
        });
    };

    static getUpcomingFixtures = (): Fixture[] => {
        const rows = EventsProcessor.db.prepare(`
            SELECT * FROM fixtures
            WHERE start_time > ?
        `).all(Date.now());

        return rows.map(EventsProcessor.mapRowToFixture);
    };

    private static getUpcomingFixturesWithoutLLMAttempt = (): Fixture[] => {
        const rows = EventsProcessor.db.prepare(`
            SELECT * FROM fixtures
            WHERE start_time > ? AND llm_attempted = 0
        `).all(Date.now());

        return rows.map(EventsProcessor.mapRowToFixture);
    };

    static getPast24hFixtures = (): Fixture[] => {
        const now = Date.now();
        const past24h = now - ((Site.WAIT_HOURS * 60 * 60 * 1000) - EVENT_DURATION); // 24 hours in milliseconds

        try {
            const rows = EventsProcessor.db.prepare(`
                SELECT * FROM fixtures
                WHERE start_time BETWEEN ? AND ?
            `).all(past24h, now);

            return rows.map(EventsProcessor.mapRowToFixture);
        } catch (err) {
            Log.dev('getPast24hFixtures error:', err);
            return [];
        }
    };

    static getFixturesNeedingResults = (
        gracePeriodMs: number,
        maxChecks: number
    ): Fixture[] => {
        const threshold = Date.now() - gracePeriodMs;
        const lateThreshold = Date.now() - (gracePeriodMs) - (1000 * 60 * 60 * Site.WAIT_HOURS);

        const rows = EventsProcessor.db.prepare(`
            SELECT * FROM fixtures
            WHERE start_time < ?
                AND start_time > ?
                AND home_goals IS NULL
                AND result_checked_count < ?
        `).all(threshold, lateThreshold, maxChecks);

        return rows.map(EventsProcessor.mapRowToFixture);
    };

    static incrementResultCheck = (eventId: string): boolean => {
        const stmt = EventsProcessor.db.prepare(`
            UPDATE fixtures
            SET result_checked_count = result_checked_count + 1
            WHERE event_id = ?
        `);

        return stmt.run(eventId).changes > 0;
    };

    private static registerLLMAttempt = (eventId: string): boolean => {
        const stmt = EventsProcessor.db.prepare(`
            UPDATE fixtures
            SET llm_attempted = 1
            WHERE event_id = ?
        `);

        return stmt.run(eventId).changes > 0;
    };

    private static saveLLMVerdict = (eventId: string, verdict: string, llmWinner: number, extractedData: any, score: number, homeScore: number, awayScore: number): boolean => {
        try {
            const stmtFixture = EventsProcessor.db.prepare(`
                UPDATE fixtures
                SET has_verdict = 1, llm_winner = ?, score = ?, home_score = ?, away_score = ?
                WHERE event_id = ?
            `);

            stmtFixture.run(llmWinner, score, homeScore, awayScore, eventId);

            const stmtVerdict = EventsProcessor.db.prepare(`
                INSERT OR REPLACE INTO ai_verdicts (event_id, extracted_data, verdict)
                VALUES (?, ?, ?)
            `);
            stmtVerdict.run(eventId, JSON.stringify(extractedData), verdict);

            return true;
        } catch (e) {
            Log.dev("saveLLMVerdict error:", e);
            throw e; // Rethrow to let the outer transaction handle it (triggering ROLLBACK in the loop)
        }
    };

    static toggleTurnOff = (eventId: string, turnedOff: boolean): boolean => {
        const stmt = EventsProcessor.db.prepare(`
            UPDATE fixtures
            SET turned_off = ?
            WHERE event_id = ?
        `);
        return stmt.run(turnedOff ? 1 : 0, eventId).changes > 0;
    };

    static deleteAllUpcoming = () => {
        const now = Date.now();
        // Delete associated AI verdicts first due to foreign key
        EventsProcessor.db.prepare(`
            DELETE FROM ai_verdicts
            WHERE event_id IN (SELECT event_id FROM fixtures WHERE start_time > ?)
        `).run(now);

        EventsProcessor.db.prepare(`
            DELETE FROM fixtures
            WHERE start_time > ?
        `).run(now);

        EventsProcessor.triggerLoop();
    };

    static getVerdict = (eventId: string): { extracted_data: any, verdict: string, score: number, home: string, away: string } | null => {
        try {
            const row = EventsProcessor.db.prepare(`
                SELECT v.*, f.score, f.home, f.away
                FROM ai_verdicts v
                JOIN fixtures f ON v.event_id = f.event_id
                WHERE v.event_id = ?
            `).get(eventId) as any;

            if (row) {
                return {
                    extracted_data: JSON.parse(row.extracted_data),
                    verdict: row.verdict,
                    score: row.score,
                    home: row.home,
                    away: row.away
                };
            }
        } catch (e) {
            Log.dev("getVerdict error:", e);
        }
        return null;
    };

    private static mapRowToFixture = (row: any): Fixture => {
        return {
            eventId: row.event_id,
            gameID: row.game_id,
            league: row.league,
            home: row.home,
            away: row.away,
            startTime: Number(row.start_time),
            odds: {
                homeWin: row.home_win ?? undefined,
                awayWin: row.away_win ?? undefined,
            },
            homeGoals: row.home_goals ?? undefined,
            awayGoals: row.away_goals ?? undefined,
            score: row.score ?? 0,
            homeScore: row.home_score ?? 0,
            awayScore: row.away_score ?? 0,
            resultCheckedCount: row.result_checked_count ?? 0,
            llmAttempted: !!row.llm_attempted,
            hasVerdict: !!row.has_verdict,
            isTurnedOff: !!row.turned_off,
            llmWinner: row.llm_winner,
        }
    }

    static getAllFixtures = (): Fixture[] => {
        const rows = EventsProcessor.db.prepare(`SELECT * FROM fixtures`).all();
        return rows.map(EventsProcessor.mapRowToFixture);
    };

    static getFullExportData = (): FullFixture[] => {
        const rows = EventsProcessor.db.prepare(`
            SELECT f.*, v.extracted_data, v.verdict
            FROM fixtures f
            LEFT JOIN ai_verdicts v ON f.event_id = v.event_id
        `).all() as any[];

        return rows.map(row => {
            const fixture = EventsProcessor.mapRowToFixture(row);
            return {
                ...fixture,
                verdict: row.verdict || undefined,
                extractedData: row.extracted_data ? JSON.parse(row.extracted_data) : undefined
            };
        });
    }

    static getCompletedFixturesWithinHours = (
        hoursAgo: number,
    ): HistoricalFixture[] => {
        const fixtures = EventsProcessor.getAllFixtures();
        const now = Date.now();
        const cutoff = now - (hoursAgo * 60 * 60 * 1000);
        const adjustedCutoff = cutoff - EVENT_DURATION;

        return fixtures.filter(f =>
            (hoursAgo <= 0 ? true : (f.startTime >= adjustedCutoff)) &&
            typeof f.homeGoals === "number" &&
            typeof f.awayGoals === "number"
        ) as HistoricalFixture[];
    }

    static generatePerformanceReport = (hours: number): string => {
        const fixtures = EventsProcessor.getCompletedFixturesWithinHours(hours);
        if (fixtures.length === 0) {
            return `No completed fixtures found for the past ${hours === 0 ? 'all time' : hours + ' hours'}.`;
        }

        let total = fixtures.length;
        let deterministicCorrect = 0;
        let deterministicAttempted = 0;
        let llmCorrect = 0;
        let llmAttempted = 0;

        const leagueStats: Record<string, { total: number, correct: number }> = {};
        const edgeStats: Record<string, { total: number, correct: number, sortKey: number }> = {};

        for (const f of fixtures) {
            const homeGoals = f.homeGoals as number;
            const awayGoals = f.awayGoals as number;
            const actualWinner = homeGoals > awayGoals ? 1 : (awayGoals > homeGoals ? 2 : 0);
            
            const homeScore = f.homeScore ?? 0;
            const awayScore = f.awayScore ?? 0;

            // Deterministic
            if (homeScore !== awayScore) {
                deterministicAttempted++;
                const detWinner = homeScore > awayScore ? 1 : 2;
                if (detWinner === actualWinner) deterministicCorrect++;
                
                // Dynamic Edge stats (5% intervals)
                const edge = Math.abs(homeScore - awayScore);
                const interval = Math.floor(edge / 0.05) * 5;
                const edgeKey = `${interval}-${interval + 5}%`;
                
                if (!edgeStats[edgeKey]) {
                    edgeStats[edgeKey] = { total: 0, correct: 0, sortKey: interval };
                }
                
                edgeStats[edgeKey].total++;
                if (detWinner === actualWinner) edgeStats[edgeKey].correct++;
            }

            // LLM
            if (f.llmWinner === 1 || f.llmWinner === 2) {
                llmAttempted++;
                if (f.llmWinner === actualWinner) llmCorrect++;
            }

            // League stats
            if (!leagueStats[f.league]) leagueStats[f.league] = { total: 0, correct: 0 };
            leagueStats[f.league].total++;
            const detWinner = homeScore > awayScore ? 1 : 2;
            if (detWinner === actualWinner) leagueStats[f.league].correct++;
        }

        let report = `SYSTEM PERFORMANCE REPORT (${hours === 0 ? 'All Time' : 'Past ' + hours + ' hours'})\n`;
        report += `System: ${Site.TITLE}\n`;
        report += `Generated at: ${new Date().toLocaleString()}\n`;
        report += `==========================================\n\n`;
        report += `OVERALL SUMMARY\n`;
        report += `Total Completed Matches: ${total}\n\n`;

        report += `DETERMINISTIC MODEL ACCURACY\n`;
        report += `Attempted: ${deterministicAttempted}\n`;
        report += `Correct: ${deterministicCorrect}\n`;
        report += `Accuracy: ${deterministicAttempted > 0 ? (deterministicCorrect / deterministicAttempted * 100).toFixed(2) : 0}%\n\n`;

        report += `LLM MODEL ACCURACY (High Confidence Picks)\n`;
        report += `Attempted: ${llmAttempted}\n`;
        report += `Correct: ${llmCorrect}\n`;
        report += `Accuracy: ${llmAttempted > 0 ? (llmCorrect / llmAttempted * 100).toFixed(2) : 0}%\n\n`;

        report += `ACCURACY BY EDGE (Deterministic)\n`;
        const sortedEdgeBuckets = Object.entries(edgeStats).sort((a, b) => a[1].sortKey - b[1].sortKey);
        for (const [key, stats] of sortedEdgeBuckets) {
            if (stats.total > 0) {
                report += `${key}: ${stats.correct}/${stats.total} (${(stats.correct / stats.total * 100).toFixed(1)}%)\n`;
            }
        }
        report += `\n`;

        report += `ACCURACY BY LEAGUE (Deterministic)\n`;
        const sortedLeagues = Object.entries(leagueStats).sort((a, b) => b[1].total - a[1].total);
        for (const [league, stats] of sortedLeagues) {
            report += `${league}: ${stats.correct}/${stats.total} (${stats.total > 0 ? (stats.correct / stats.total * 100).toFixed(1) : 0}%)\n`;
        }

        return report;
    }

    static updateMatchResult = (
        eventId: string,
        homeGoals: number,
        awayGoals: number,
        timeRange?: { from: number; to: number }
    ): boolean => {
        let stmt;

        if (timeRange) {
            stmt = EventsProcessor.db.prepare(`
                UPDATE fixtures
                SET home_goals = ?, away_goals = ?
                WHERE event_id = ?
                    AND start_time BETWEEN ? AND ?
            `);

            return stmt.run(
                homeGoals,
                awayGoals,
                eventId,
                timeRange.from,
                timeRange.to
            ).changes > 0;
        }

        stmt = EventsProcessor.db.prepare(`
            UPDATE fixtures
            SET home_goals = ?, away_goals = ?
            WHERE event_id = ?
        `);

        return stmt.run(homeGoals, awayGoals, eventId).changes > 0;
    };

    private static saveFixture = (fixture: Fixture): boolean => {
        const stmt = EventsProcessor.db.prepare(`
            INSERT INTO fixtures (
                event_id, game_id, league, home, away, start_time,
                home_win, away_win,
                score, home_Score, away_score,
                result_checked_count,
                turned_off
            )
            VALUES (
                @eventId, @gameID, @league, @home, @away, @startTime,
                @homeWin, @awayWin,
                @score, @homeScore, @awayScore,
                @resultCheckedCount,
                @turnedOff
            )
            ON CONFLICT(event_id) DO UPDATE SET
                home_win = EXCLUDED.home_win,
                away_win = EXCLUDED.away_win
        `);

        const params = {
            eventId: fixture.eventId,
            gameID: fixture.gameID,
            league: fixture.league,
            home: fixture.home,
            away: fixture.away,
            startTime: fixture.startTime,
            homeWin: fixture.odds.homeWin ?? null,
            awayWin: fixture.odds.awayWin ?? null,
            score: fixture.score ?? null,
            homeScore: fixture.homeScore ?? null,
            awayScore: fixture.awayScore ?? null,
            resultCheckedCount: fixture.resultCheckedCount ?? 0,
            turnedOff: 0,
        };

        const result = stmt.run(params);

        return result.changes > 0;
    }

    private static processEventFeatures = (event: Event): Odds => {
        const odds: Odds = {};

        const toBeFilled = 2;
        let filled = 0

        for (const market of event.markets) {
            const name = (market.name || '').toLowerCase();
            const desc = (market.desc || '').toLowerCase();
            const spec = (market.specifier || '').toLowerCase();

            if (name == "winner" || desc == "winner") {
                const awayWin = market.outcomes.find(o => (o.desc || '').toLowerCase() == "away")?.odds;
                const homeWin = market.outcomes.find(o => (o.desc || '').toLowerCase() == "home")?.odds;
                if (awayWin) odds.awayWin = parseFloat(awayWin);
                if (homeWin) odds.homeWin = parseFloat(homeWin);
                filled += 2;
            }

            if (filled >= toBeFilled) {
                break;
            }
        }

        return odds;
    }

    private static newEvents = async (events: Event[]) => {
        const qualityEvents = events.filter(event => {
            const isNotStart = (event.matchStatus || '').toLowerCase() === "not start";
            return event.status === 0 && isNotStart && !event.banned;
        });
        const reallyNewEvents = [];
        for (const event of qualityEvents) {
            if (!(await EventsProcessor.eventAlreadyExists(event.eventId))) {
                reallyNewEvents.push(event);
            }
        }
        const processedEvents: Fixture[] = reallyNewEvents.map(event => {
            return {
                away: event.awayTeamName,
                home: event.homeTeamName,
                eventId: event.eventId,
                gameID: event.gameId,
                league: event.sport.category.tournament.name,
                startTime: event.estimateStartTime,
                resultCheckedCount: 0,
                odds: EventsProcessor.processEventFeatures(event),
            } as Fixture;
        });
        return processedEvents;
    }

    static triggerLoop = () => {
        if (EventsProcessor.timeo) {
            clearTimeout(EventsProcessor.timeo);
            EventsProcessor.timeo = null;
        }
        EventsProcessor.run();
    }


    private static running: boolean = false;

    private static timeo: NodeJS.Timeout | null = null;

    private static run = async () => {
        if (EventsProcessor.running) return;
        EventsProcessor.running = true;
        const start = Date.now();
        const conclude = () => {
            Log.flow([SLUG, `Iteration`, `Concluded.`], WEIGHT);
            const duration = Date.now() - start;
            EventsProcessor.running = false;
            if (duration >= Site.SYS_INT) {
                EventsProcessor.run();
            }
            else {
                const rem = Site.SYS_INT - duration;
                if (EventsProcessor.timeo) {
                    clearTimeout(EventsProcessor.timeo);
                    EventsProcessor.timeo = null;
                }
                EventsProcessor.timeo = setTimeout(() => {
                    EventsProcessor.run();
                }, rem);
                Log.flow([SLUG, `Next iteration scheduled in ${getTimeElapsed(0, rem)}.`], WEIGHT);

            }
        }
        Log.flow([SLUG, `Iteration`, `Initialized.`], WEIGHT);
        try {
            // Fetching new events
            Log.flow([SLUG, `Iteration`, `Fetching new events.`], WEIGHT);
            const newEvents = await SportyHelpers.getUpcoming();
            if (newEvents) {
                Log.flow([SLUG, `Iteration`, `Fetched ${newEvents.length} upcoming event(s).`], WEIGHT);
                const processedEvents = await EventsProcessor.newEvents(newEvents);
                Log.flow([SLUG, `Iteration`, `Processed ${processedEvents.length} high-quality new event(s).`], WEIGHT);
                let saved: number = 0;
                EventsProcessor.db.exec("BEGIN");
                for (const event of processedEvents) {
                    const s = EventsProcessor.saveFixture(event);
                    saved++;
                    
                    const RE = await EventsProcessor.getResultEngine();
                    if (RE) {
                        RE.newFixture({
                            eventId: event.eventId,
                            startTime: event.startTime
                        });
                    }

                    const extracted = await SofascoreEngine.get({
                        away: event.away,
                        home: event.home,
                        league: event.league,
                        startTime: event.startTime,
                    });

                    if (extracted) {
                        EventsProcessor.registerLLMAttempt(event.eventId);
                        // Log.dev(`Stats for ${event.home} vs ${event.away}`, JSON.stringify(extracted, null, 2));
                        const score = tennisWinnerScore(extracted);
                        // Log.dev(`Score details for ${event.home} vs ${event.away}`, JSON.stringify(score, null, 2));
                        if (score.edge >= Site.LLM_MIN_EDGE) {
                            const verdict = await PromptEngine.verdict(event.home, event.away, event.league, event.startTime, {
                                odds: event.odds,
                                extracted,
                            });
                            Log.flow([SLUG, `Iteration`, `${event.home} vs ${event.away}`, `Verdict gotten.`], WEIGHT);
                            if (verdict) {
                                // Log.dev(`Verdict details for ${event.home} vs ${event.away}`, JSON.stringify(verdict, null, 2));
                                EventsProcessor.saveLLMVerdict(event.eventId, verdict.reason, verdict.winner, extracted, score.edge, score.homeWinScore, score.awayWinScore);
                            }
                        }
                        else {
                            EventsProcessor.saveLLMVerdict(event.eventId, '', 0, extracted, score.edge, score.homeWinScore, score.awayWinScore);
                        }
                    }
                }
                EventsProcessor.db.exec("COMMIT");
                Log.flow([SLUG, `Iteration`, `Saved ${saved} event(s).`], WEIGHT);
            }

            else {
                Log.flow([SLUG, `Iteration`, `Failed to fetch new events.`], WEIGHT);
            }

        } catch (error) {
            Log.dev(error);
        }
        conclude();
    }

    private static sleep = (m: number) => new Promise(r => setTimeout(r, m));

    private static randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

}
