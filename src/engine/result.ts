import { Log } from './../lib/log';
import path from 'path';
import { Booking, Checker, LoadSelectionsResponse, ResultDB, SubFixture, WaitingSets } from './../model/result';
import { Booker, loadSelections } from './booker';
import { Site } from './../site';
import { existsSync, mkdirSync, readFile, writeFileSync } from 'fs';
import { EventsProcessor } from './events_processor';
const SLUG = "RE";
const WEIGHT = 4;
export class ResultEngine {

    private static INTERVAL_MS: number = 1000 * 60 * 2;

    private static MAX_WAIT_TIME_MS: number = 1000 * 60 * 2;

    private static MAX_SELECTIONS_PER_BOOKING: number = 50;

    private static MAX_RETRIES: number = 3;

    private static bookings: Booking[] = [];

    private static waiting: WaitingSets | null = null;

    private static ESTIMATED_EVENT_DURATION_MS: number = 1000 * 60 * 60 * 2.5;

    private static CHECK_INTERVAL_MS: number = 1000 * 60 * 90;

    private static resetWaiting = () => {
        return {
            fixtures: [],
            startTime: Date.now(),
        } as WaitingSets;
    };

    private static checkWaiting = async () => {
        if (ResultEngine.waiting) {
            const lifespan = Date.now() - ResultEngine.waiting.startTime;
            if (ResultEngine.waiting.fixtures.length >= ResultEngine.MAX_SELECTIONS_PER_BOOKING || (lifespan >= ResultEngine.MAX_WAIT_TIME_MS && ResultEngine.waiting.fixtures.length > 0)) {
                // Ripe for harvest
                Log.flow([SLUG, `Waiting set`, `Ripe for harvest (${ResultEngine.waiting.fixtures.length} fixture(s)).`], WEIGHT);
                const cp: WaitingSets = JSON.parse(JSON.stringify(ResultEngine.waiting));
                ResultEngine.waiting = null;
                await ResultEngine.processWaiting(cp);
            }
        }
        return null;
    }

    private static processWaiting = async (waiting: WaitingSets) => {
        Log.flow([SLUG, `Processing waiting set`, `${waiting.fixtures.length} fixture(s).`], WEIGHT);
        const selections = waiting.fixtures.map(f => ({
            specifier: null,
            eventId: f.eventId,
            marketId: `186`,
            outcomeId: `4`,
            sportId: `sr:sport:5`,
        }));
        Log.flow([SLUG, `Booking`, `Attempting to book ${selections.length} selection(s) on Sporty...`], WEIGHT);
        const res = await Booker.bookSporty(selections);
        if (res) {
            const code = res.codes;
            Log.flow([SLUG, `Booking`, `Success! Code: ${code} (${res.count} selections @ ${res.totalOdds.toFixed(2)} odds)`], WEIGHT);
            const leastStartTime = Math.min(...waiting.fixtures.map(f => f.startTime));
            const maxStartTime = Math.max(...waiting.fixtures.map(f => f.startTime));
            const start = leastStartTime + ResultEngine.ESTIMATED_EVENT_DURATION_MS;
            const stop = maxStartTime + ResultEngine.ESTIMATED_EVENT_DURATION_MS;
            const checkers: Checker[] = [];
            for (let i = start; i < stop; i += ResultEngine.CHECK_INTERVAL_MS) {
                checkers.push({
                    timestamp: i,
                    state: 0,
                })
            }
            checkers.push({
                timestamp: stop,
                state: 0,
            });
            if (!ResultEngine.bookings.find(b => b.code == code)) {
                ResultEngine.bookings.push({
                    code,
                    checkers,
                });
            }
        }
        else {
            Log.flow([SLUG, `Booking`, `Failed. Merging back to waiting...`], WEIGHT);
            ResultEngine.mergeFailedWaiting(waiting);
        }
        return null;
    }

    private static mergeFailedWaiting = (waiting: WaitingSets) => {
        const newWaiting = ResultEngine.resetWaiting();
        if (ResultEngine.waiting) {
            newWaiting.fixtures = newWaiting.fixtures.concat(ResultEngine.waiting.fixtures);
        }
        newWaiting.fixtures = newWaiting.fixtures.concat(waiting.fixtures.filter(f => (f.retries || 0) <= ResultEngine.MAX_RETRIES).map(f => ({ ...f, retries: (f.retries || 0) + 1 })));
        ResultEngine.waiting = newWaiting;
    }

    static newFixture = (fix: SubFixture) => {
        if (!ResultEngine.waiting) {
            ResultEngine.waiting = ResultEngine.resetWaiting();
        }
        fix.retries = 0;
        ResultEngine.waiting.fixtures.push(fix);

    }

    private static dataDirectory = path.join(Site.ROOT, ".data");
    private static storageFile = path.join(ResultEngine.dataDirectory, "result_cache.json");

    private static isRunning: boolean = false;

    private static run = async () => {
        if (ResultEngine.isRunning) return;
        ResultEngine.isRunning = true;
        const start = Date.now();
        const conclude = () => {
            Log.flow([SLUG, `Iteration`, `Concluded.`], WEIGHT);
            const interval = ResultEngine.INTERVAL_MS;
            const duration = Date.now() - start;
            ResultEngine.isRunning = false;
            if (duration >= interval) {
                ResultEngine.run();
            }
            else {
                const timeToGetThere = interval - duration;
                setTimeout(() => {
                    ResultEngine.run();
                }, timeToGetThere);
                Log.flow([SLUG, `Next iteration scheduled in ${Math.round(timeToGetThere / 1000)}s.`], WEIGHT);
            }
        }
        Log.flow([SLUG, `Iteration`, `Initialized.`], WEIGHT);
        await ResultEngine.checkWaiting();

        // check results from bookings
        const storedIds: string[] = [];
        const resultSheet: Map<string, {
            homeScores: number;
            awayScores: number;
        }> = new Map();
        const bookingToDiscard: string[] = [];
        Log.flow([SLUG, `Iteration`, `Checking results for ${ResultEngine.bookings.length} booking(s)...`], WEIGHT);
        const parseBody = (body: LoadSelectionsResponse, code: string) => {
            let found = 0;
            const seenIds = new Set<string>();
            for (const selection of body.data.ticket.selections) {
                seenIds.add(selection.eventId);
                if (!storedIds.includes(selection.eventId)) {
                    storedIds.push(selection.eventId);
                }
            }
            for (const o of body.data.outcomes) {
                const status = (o.matchStatus || '').toLowerCase();
                if (status !== "ended" && status !== "final" && status !== "retired" && status !== "walkover") {
                    continue;
                }
                if (!seenIds.has(o.eventId)) {
                    continue;
                }
                const scores = (o.setScore || '').split(":").filter(x => x.length > 0).map(x => parseInt(x)).filter(x => Number.isFinite(x));
                if (scores.length == 2) {
                    resultSheet.set(o.eventId, {
                        homeScores: scores[0],
                        awayScores: scores[1],
                    });
                    found++;
                } else {
                    Log.flow([SLUG, `Booking`, code, `Event ${o.eventId} ended but no setScore found: "${o.setScore}"`], WEIGHT);
                }
            }
            if (found > 0) {
                Log.flow([SLUG, `Booking`, code, `Found results for ${found} event(s).`], WEIGHT);
            }
        }
        for (const booking of ResultEngine.bookings) {
            const now = Date.now();
            const pendingCheckers = booking.checkers.filter(c => c.state === 0 && c.timestamp <= now);
            const isRunning = !!(booking.checkers.find(c => c.state === 1));
            if (!isRunning) {
                const lastChecker = booking.checkers[booking.checkers.length - 1];
                if (pendingCheckers.length > 0) {
                    // pending
                    Log.flow([SLUG, `Booking`, booking.code, `Checking results...`], WEIGHT);
                    const availableChecker = pendingCheckers.pop()!;
                    // update state of other pending checkers to cancelled
                    for (const c of pendingCheckers) {
                        c.state = 5;
                    }

                    availableChecker.state = 1;
                    const body: LoadSelectionsResponse | null = await loadSelections(booking.code, true);
                    if (!body) {
                        Log.flow([SLUG, `Booking`, booking.code, `Failed to load selections.`], WEIGHT);
                        availableChecker.state = availableChecker.timestamp == lastChecker.timestamp ? 3 : 4;
                    }
                    else {
                        parseBody(body, booking.code);
                        availableChecker.state = 2;
                    }

                }
                else {
                    // no pending checkers... check for retry state on last checker;
                    if (lastChecker.state === 3 && lastChecker.timestamp <= now) {
                        // should retry this checker
                        Log.flow([SLUG, `Booking`, booking.code, `Retrying result check...`], WEIGHT);
                        lastChecker.state = 1;
                        const body: LoadSelectionsResponse | null = await loadSelections(booking.code, true);
                        if (!body) {
                            Log.flow([SLUG, `Booking`, booking.code, `Retry failed to load selections.`], WEIGHT);
                            lastChecker.state = 4;
                        }
                        else {
                            parseBody(body, booking.code);
                            lastChecker.state = 2;
                        }
                    }
                }
                // check if last checker and discard booking code
                if (lastChecker.state === 2 || lastChecker.state == 5 || lastChecker.state == 4) {
                    Log.flow([SLUG, `Booking`, booking.code, `Discarding. State: ${lastChecker.state}`], WEIGHT);
                    bookingToDiscard.push(booking.code);
                }
            }
        }

        // discards
        ResultEngine.bookings = ResultEngine.bookings.filter(b => (!bookingToDiscard.includes(b.code)));

        const fixtures = EventsProcessor.getFixturesNeedingResults(ResultEngine.ESTIMATED_EVENT_DURATION_MS, 1);
        if (fixtures.length > 0) {
            Log.flow([SLUG, `Iteration`, `Updating ${fixtures.length} fixture(s) needing results...`], WEIGHT);
        }
        let updatedCount = 0;
        for (const fixt of fixtures) {
            if (resultSheet.has(fixt.eventId)) {
                const r = resultSheet.get(fixt.eventId)!;
                const ok1 = EventsProcessor.incrementResultCheck(fixt.eventId);
                const ok2 = EventsProcessor.updateMatchResult(fixt.eventId, r?.homeScores, r.awayScores, {
                    from: fixt.startTime - 300000,
                    to: fixt.startTime + 300000,
                })
                if (ok1 && ok2) {
                    updatedCount++;
                }
            }
        }
        if (updatedCount > 0) {
            Log.flow([SLUG, `Iteration`, `Updated results for ${updatedCount} fixture(s).`], WEIGHT);
        }

        conclude();
    }

    static start = () => new Promise<boolean>(async (resolve, reject) => {
        if (!existsSync(ResultEngine.dataDirectory)) {
            mkdirSync(ResultEngine.dataDirectory, { recursive: true });
        }

        const loadStorage = () => new Promise<boolean>((res, rej) => {
            if (existsSync(ResultEngine.storageFile)) {
                readFile(ResultEngine.storageFile, "utf8", (err, data) => {
                    if (err) {
                        Log.dev(err);
                        res(false);
                    }
                    else {
                        let isErr: boolean = false;
                        let parsed: ResultDB = {};
                        try {
                            parsed = JSON.parse(data);
                        } catch (error) {
                            Log.dev(error);
                            isErr = true;
                        }
                        if (isErr) {
                            res(false);
                        }
                        else {
                            if (parsed.bookings) {
                                ResultEngine.bookings = parsed.bookings;
                                // reset running states back to pending
                                for (const b of ResultEngine.bookings) {
                                    b.checkers = b.checkers.map(b => ({ ...b, state: b.state == 1 ? 0 : b.state }));
                                }
                                Log.flow([SLUG, `Loaded persisted data`, `Bookings = ${ResultEngine.bookings.length}.`], WEIGHT);
                            }
                            if (parsed.waiting) {
                                ResultEngine.waiting = parsed.waiting;
                                Log.flow([SLUG, `Loaded persisted data`, `Waiting fixtures = ${ResultEngine.waiting.fixtures.length}.`], WEIGHT);
                            }
                            res(true);
                        }
                    }
                });
            }
            else {
                res(true);
            }
        });

        const startedWell = await loadStorage();
        if (startedWell) {
            ResultEngine.run();
        }
        resolve(startedWell);
    });

    static stop = () => new Promise<boolean>((resolve, reject) => {
        const db: ResultDB = {
            bookings: ResultEngine.bookings,
            waiting: ResultEngine.waiting || undefined,
        };
        writeFileSync(ResultEngine.storageFile, JSON.stringify(db), "utf8");
        Log.flow([SLUG, `Persisted data`, `Bookings = ${db?.bookings?.length || 0}, Waiting = ${db.waiting?.fixtures?.length || 0}.`], WEIGHT);
        resolve(true);
    });
}
