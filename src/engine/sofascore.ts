import { VotesResponse, H2HResponse, OverallResponse, RankingsResponse, TeamLastEventsResponse, YearStatsResponse } from './../model/sofascore_3';
import { Extracted } from './../model/prompt';
// import { FeaturedPlayersResponse, H2HResponse, MatchManagersResponse, OverallResponse, PregameResponse, StandingsResponse } from './../model/sofascore_2';
import { axiosUndici } from './../lib/axios';
import { getTimeElapsed } from './../lib/date_time';
import { Match, SofaScoreResponse, Event, Tournament } from './../model/sofascore';
import { Log } from './../lib/log';
import path from "path";
import { Site } from "./../site";
import { existsSync, mkdirSync, readFile, writeFileSync } from "fs";
import { normalizeName } from './../lib/sofa_lib';
import { ClientIdentifier, initTLS, Session } from "node-tls-client";
import stringSimilarity from "string-similarity";
import { findBestMatch } from './../lib/fbm';

const cleaner = (r: string) => r.replace(/[,.]/g, '').split(" ").filter(x => x.length > 0).join(" ");

const SLUG = "SSEngine";
const WEIGHT = 4;

interface InitialData {
    statistics?: any;
    h2h?: any;
    teamStats?: any;
}

declare global {
    interface Window {
        __INITIAL_DATA__?: InitialData;
    }
}

const goodNum = (n: any) => Number.isFinite(n) ? parseFloat(n.toFixed(4)) : n;

type Form = "W" | "L" | "D";

const getPregameForm = (r: TeamLastEventsResponse | null, team: number, maxLength: number = 10): Form[] | null => {
    if (r == null) return null;
    const events = r.events.filter(e => e.status.code == 100).sort((a, b) => b.startTimestamp - a.startTimestamp);
    const form: Form[] = [];
    for (const event of events) {
        const isHome = event.homeTeam.id == team;
        const winnerCode = event.winnerCode;
        if (isHome) {
            if (winnerCode == 1) {
                form.push('W')
            }
            else if (winnerCode == 2) {
                form.push('L');
            }
            else if (winnerCode == 3) {
                form.push('D');
            }
        }
        else {
            if (winnerCode == 1) {
                form.push('L')
            }
            else if (winnerCode == 2) {
                form.push('W');
            }
            else if (winnerCode == 3) {
                form.push('D');
            }
        }
        if (form.length >= maxLength) {
            break;
        }
    }
    return form;
}

export class SofascoreEngine {
    private static file = path.join(Site.ROOT, ".data", "sofascore_v2.json");

    private static matchesByTeam: Map<string, Match[]> = new Map();
    private static matchesByID: Map<number, Match> = new Map();

    private static tournamentsByDate: Map<string, Tournament[]> = new Map();
    private static fetchedTournamentsPerDate: Map<string, Set<number>> = new Map();

    private static session: Session;

    private static matches2pointers = (matches: Match[]) => {
        const allTeams: string[] = [];
        SofascoreEngine.matchesByTeam.clear();
        SofascoreEngine.matchesByID.clear();
        const checkTeam = (team: string, match: Match) => {
            if (!allTeams.includes(team)) {
                if (!SofascoreEngine.matchesByTeam.has(team)) {
                    SofascoreEngine.matchesByTeam.set(team, []);
                }
                const newVal = SofascoreEngine.matchesByTeam.get(team)!.concat([match]);
                SofascoreEngine.matchesByTeam.set(team, newVal);
            }
        }
        for (const match of matches) {
            checkTeam(match.home, match);
            checkTeam(match.away, match);
            SofascoreEngine.matchesByID.set(match.id, match);
        }
    }

    private static getMatchData = async (match: Match) => {
        try {
            const goTO = async (url: string) => {
                try {
                    const res = await SofascoreEngine.request(url);
                    return res;
                } catch (error: any) {
                    if (!error.message?.includes('404')) {
                        Log.dev(error.message || error);
                    }
                    return null;
                }
            }

            const votes: VotesResponse | null = await goTO(`https://www.sofascore.com/api/v1/event/${match.id}/votes`);
            const h2h: H2HResponse | null = await goTO(`https://www.sofascore.com/api/v1/event/${match.id}/h2h`);
            const rankingsHome: RankingsResponse | null = await goTO(`https://www.sofascore.com/api/v1/team/${match.homeId}/rankings`);
            const rankingsAway: RankingsResponse | null = await goTO(`https://www.sofascore.com/api/v1/team/${match.awayId}/rankings`);
            const statsHome: OverallResponse | null = await goTO(`https://www.sofascore.com/api/v1/team/${match.homeId}/unique-tournament/${match.tId}/season/${match.seasonId}/statistics/overall`);
            const statsAway: OverallResponse | null = await goTO(`https://www.sofascore.com/api/v1/team/${match.awayId}/unique-tournament/${match.tId}/season/${match.seasonId}/statistics/overall`);
            const homeLastEvents: TeamLastEventsResponse | null = await goTO(`https://www.sofascore.com/api/v1/team/${match.homeId}/events/last/0`);
            const awayLastEvents: TeamLastEventsResponse | null = await goTO(`https://www.sofascore.com/api/v1/team/${match.awayId}/events/last/0`);
            const currentYear = (new Date()).getFullYear();
            const homeYearStats: YearStatsResponse | null = await goTO(`https://www.sofascore.com/api/v1/team/${match.homeId}/year-statistics/${currentYear}`);
            const awayYearStats: YearStatsResponse | null = await goTO(`https://www.sofascore.com/api/v1/team/${match.awayId}/year-statistics/${currentYear}`);

            const sH = statsHome?.statistics;
            const sA = statsAway?.statistics;

            const homeForm = getPregameForm(homeLastEvents, match.homeId);
            const awayForm = getPregameForm(awayLastEvents, match.awayId);
            // TODO
            const response: Extracted = {
                leagueContext: {
                    leagueName: match.league ?? undefined,
                    season: match.season ?? undefined,
                },
                homeTeamStats: {
                    pregame: homeForm ? {
                        form: homeForm ?? undefined,
                    } : {},
                    currentYearStats: (homeYearStats && homeYearStats.statistics && homeYearStats.statistics.length > 0) ? {
                        matches: homeYearStats.statistics[0].matches ?? undefined,
                        surface: homeYearStats.statistics[0].groundType ?? undefined,

                        performance: {
                            winRate: (Number.isFinite(homeYearStats.statistics[0].wins) && Number.isFinite(homeYearStats.statistics[0].matches))
                                ? goodNum(homeYearStats.statistics[0].wins / homeYearStats.statistics[0].matches)
                                : undefined,

                            tournamentWinRate: (Number.isFinite(homeYearStats.statistics[0].tournamentsWon) && Number.isFinite(homeYearStats.statistics[0].tournamentsPlayed))
                                ? goodNum(homeYearStats.statistics[0].tournamentsWon / homeYearStats.statistics[0].tournamentsPlayed)
                                : undefined
                        },

                        serve: {
                            aceRate: (Number.isFinite(homeYearStats.statistics[0].aces) && Number.isFinite(homeYearStats.statistics[0].totalServeAttempts))
                                ? goodNum(homeYearStats.statistics[0].aces / homeYearStats.statistics[0].totalServeAttempts)
                                : undefined,

                            doubleFaultRate: (Number.isFinite(homeYearStats.statistics[0].doubleFaults) && Number.isFinite(homeYearStats.statistics[0].totalServeAttempts))
                                ? goodNum(homeYearStats.statistics[0].doubleFaults / homeYearStats.statistics[0].totalServeAttempts)
                                : undefined,

                            firstServeInRate: (Number.isFinite(homeYearStats.statistics[0].firstServeTotal) && Number.isFinite(homeYearStats.statistics[0].totalServeAttempts))
                                ? goodNum(homeYearStats.statistics[0].firstServeTotal / homeYearStats.statistics[0].totalServeAttempts)
                                : undefined,

                            firstServeWinRate: (Number.isFinite(homeYearStats.statistics[0].firstServePointsScored) && Number.isFinite(homeYearStats.statistics[0].firstServePointsTotal))
                                ? goodNum(homeYearStats.statistics[0].firstServePointsScored / homeYearStats.statistics[0].firstServePointsTotal)
                                : undefined,

                            secondServeWinRate: (Number.isFinite(homeYearStats.statistics[0].secondServePointsScored) && Number.isFinite(homeYearStats.statistics[0].secondServePointsTotal))
                                ? goodNum(homeYearStats.statistics[0].secondServePointsScored / homeYearStats.statistics[0].secondServePointsTotal)
                                : undefined,

                            servicePointsWinRate: (
                                Number.isFinite(homeYearStats.statistics[0].firstServePointsScored) &&
                                Number.isFinite(homeYearStats.statistics[0].secondServePointsScored) &&
                                Number.isFinite(homeYearStats.statistics[0].firstServePointsTotal) &&
                                Number.isFinite(homeYearStats.statistics[0].secondServePointsTotal)
                            )
                                ? goodNum(
                                    (homeYearStats.statistics[0].firstServePointsScored + homeYearStats.statistics[0].secondServePointsScored) /
                                    (homeYearStats.statistics[0].firstServePointsTotal + homeYearStats.statistics[0].secondServePointsTotal)
                                )
                                : undefined
                        },

                        pressure: {
                            breakPointConversion: (Number.isFinite(homeYearStats.statistics[0].breakPointsScored) && Number.isFinite(homeYearStats.statistics[0].breakPointsTotal))
                                ? goodNum(homeYearStats.statistics[0].breakPointsScored / homeYearStats.statistics[0].breakPointsTotal)
                                : undefined,

                            breakPointDefense: (Number.isFinite(homeYearStats.statistics[0].opponentBreakPointsScored) && Number.isFinite(homeYearStats.statistics[0].opponentBreakPointsTotal))
                                ? goodNum(
                                    1 - (homeYearStats.statistics[0].opponentBreakPointsScored / homeYearStats.statistics[0].opponentBreakPointsTotal)
                                )
                                : undefined,

                            tiebreakWinRate: (Number.isFinite(homeYearStats.statistics[0].tiebreaksWon) && Number.isFinite(homeYearStats.statistics[0].tiebreakLosses))
                                ? goodNum(
                                    homeYearStats.statistics[0].tiebreaksWon /
                                    (homeYearStats.statistics[0].tiebreaksWon + homeYearStats.statistics[0].tiebreakLosses)
                                )
                                : undefined
                        },

                        shotQuality: {
                            winnerErrorRatio: (Number.isFinite(homeYearStats.statistics[0].winnersTotal) && Number.isFinite(homeYearStats.statistics[0].unforcedErrorsTotal))
                                ? goodNum(homeYearStats.statistics[0].winnersTotal / homeYearStats.statistics[0].unforcedErrorsTotal)
                                : undefined
                        }

                    } : {},
                    currentSeasonStats: sH ? {
                        matches: sH.matches ?? undefined,

                        performance: {
                            winRate: (Number.isFinite(sH.wins) && Number.isFinite(sH.matches))
                                ? goodNum(sH.wins / sH.matches)
                                : undefined
                        },

                        serve: {
                            aceRate: (Number.isFinite(sH.aces) && Number.isFinite(sH.totalServeAttempts))
                                ? goodNum(sH.aces / sH.totalServeAttempts)
                                : undefined,

                            doubleFaultRate: (Number.isFinite(sH.doubleFaults) && Number.isFinite(sH.totalServeAttempts))
                                ? goodNum(sH.doubleFaults / sH.totalServeAttempts)
                                : undefined,

                            firstServeInRate: Number.isFinite(sH.firstServePercentage)
                                ? goodNum(sH.firstServePercentage / 100)
                                : undefined,

                            firstServeWinRate: Number.isFinite(sH.firstServePointsWonPercentage)
                                ? goodNum(sH.firstServePointsWonPercentage / 100)
                                : undefined,

                            secondServeWinRate: Number.isFinite(sH.secondServePointsWonPercentage)
                                ? goodNum(sH.secondServePointsWonPercentage / 100)
                                : undefined,

                            servicePointsWinRate: (
                                Number.isFinite(sH.firstServePointsScored) &&
                                Number.isFinite(sH.secondServePointsScored) &&
                                Number.isFinite(sH.firstServePointsTotal) &&
                                Number.isFinite(sH.secondServePointsTotal)
                            )
                                ? goodNum(
                                    (sH.firstServePointsScored + sH.secondServePointsScored) /
                                    (sH.firstServePointsTotal + sH.secondServePointsTotal)
                                )
                                : undefined
                        },

                        pressure: {
                            breakPointConversion: Number.isFinite(sH.breakPointsSavedConvertedPercentage)
                                ? goodNum(sH.breakPointsSavedConvertedPercentage / 100)
                                : undefined,

                            breakPointDefense: Number.isFinite(sH.breakPointsSavedPercentage)
                                ? goodNum(sH.breakPointsSavedPercentage / 100)
                                : undefined,

                            tiebreakWinRate: Number.isFinite(sH.tiebreakWinPercentage)
                                ? goodNum(sH.tiebreakWinPercentage / 100)
                                : undefined
                        }

                    } : undefined,
                    rankings: (rankingsHome && rankingsHome.rankings && Array.isArray(rankingsHome.rankings)) ? rankingsHome.rankings.map(r => {
                        return {
                            bestRanking: r.bestRanking ?? undefined,
                            country: r.country?.name ?? undefined,
                            points: r.points ?? undefined,
                            previousPoints: r.previousPoints ?? undefined,
                            previousRanking: r.previousRanking ?? undefined,
                            ranking: r.ranking ?? undefined,
                            rankingClass: r.rankingClass ?? undefined,
                            tournamentsPlayed: r.tournamentsPlayed ?? undefined,
                        }
                    }) : undefined
                },
                awayTeamStats: {
                    pregame: awayForm ? {
                        form: awayForm ?? undefined,
                    } : {},
                    currentYearStats: (awayYearStats && awayYearStats.statistics && awayYearStats.statistics.length > 0) ? {
                        matches: awayYearStats.statistics[0].matches ?? undefined,
                        surface: awayYearStats.statistics[0].groundType ?? undefined,

                        performance: {
                            winRate: (Number.isFinite(awayYearStats.statistics[0].wins) && Number.isFinite(awayYearStats.statistics[0].matches))
                                ? goodNum(awayYearStats.statistics[0].wins / awayYearStats.statistics[0].matches)
                                : undefined,

                            tournamentWinRate: (Number.isFinite(awayYearStats.statistics[0].tournamentsWon) && Number.isFinite(awayYearStats.statistics[0].tournamentsPlayed))
                                ? goodNum(awayYearStats.statistics[0].tournamentsWon / awayYearStats.statistics[0].tournamentsPlayed)
                                : undefined
                        },

                        serve: {
                            aceRate: (Number.isFinite(awayYearStats.statistics[0].aces) && Number.isFinite(awayYearStats.statistics[0].totalServeAttempts))
                                ? goodNum(awayYearStats.statistics[0].aces / awayYearStats.statistics[0].totalServeAttempts)
                                : undefined,

                            doubleFaultRate: (Number.isFinite(awayYearStats.statistics[0].doubleFaults) && Number.isFinite(awayYearStats.statistics[0].totalServeAttempts))
                                ? goodNum(awayYearStats.statistics[0].doubleFaults / awayYearStats.statistics[0].totalServeAttempts)
                                : undefined,

                            firstServeInRate: (Number.isFinite(awayYearStats.statistics[0].firstServeTotal) && Number.isFinite(awayYearStats.statistics[0].totalServeAttempts))
                                ? goodNum(awayYearStats.statistics[0].firstServeTotal / awayYearStats.statistics[0].totalServeAttempts)
                                : undefined,

                            firstServeWinRate: (Number.isFinite(awayYearStats.statistics[0].firstServePointsScored) && Number.isFinite(awayYearStats.statistics[0].firstServePointsTotal))
                                ? goodNum(awayYearStats.statistics[0].firstServePointsScored / awayYearStats.statistics[0].firstServePointsTotal)
                                : undefined,

                            secondServeWinRate: (Number.isFinite(awayYearStats.statistics[0].secondServePointsScored) && Number.isFinite(awayYearStats.statistics[0].secondServePointsTotal))
                                ? goodNum(awayYearStats.statistics[0].secondServePointsScored / awayYearStats.statistics[0].secondServePointsTotal)
                                : undefined,

                            servicePointsWinRate: (
                                Number.isFinite(awayYearStats.statistics[0].firstServePointsScored) &&
                                Number.isFinite(awayYearStats.statistics[0].secondServePointsScored) &&
                                Number.isFinite(awayYearStats.statistics[0].firstServePointsTotal) &&
                                Number.isFinite(awayYearStats.statistics[0].secondServePointsTotal)
                            )
                                ? goodNum(
                                    (awayYearStats.statistics[0].firstServePointsScored + awayYearStats.statistics[0].secondServePointsScored) /
                                    (awayYearStats.statistics[0].firstServePointsTotal + awayYearStats.statistics[0].secondServePointsTotal)
                                )
                                : undefined
                        },

                        pressure: {
                            breakPointConversion: (Number.isFinite(awayYearStats.statistics[0].breakPointsScored) && Number.isFinite(awayYearStats.statistics[0].breakPointsTotal))
                                ? goodNum(awayYearStats.statistics[0].breakPointsScored / awayYearStats.statistics[0].breakPointsTotal)
                                : undefined,

                            breakPointDefense: (Number.isFinite(awayYearStats.statistics[0].opponentBreakPointsScored) && Number.isFinite(awayYearStats.statistics[0].opponentBreakPointsTotal))
                                ? goodNum(
                                    1 - (awayYearStats.statistics[0].opponentBreakPointsScored / awayYearStats.statistics[0].opponentBreakPointsTotal)
                                )
                                : undefined,

                            tiebreakWinRate: (Number.isFinite(awayYearStats.statistics[0].tiebreaksWon) && Number.isFinite(awayYearStats.statistics[0].tiebreakLosses))
                                ? goodNum(
                                    awayYearStats.statistics[0].tiebreaksWon /
                                    (awayYearStats.statistics[0].tiebreaksWon + awayYearStats.statistics[0].tiebreakLosses)
                                )
                                : undefined
                        },

                        shotQuality: {
                            winnerErrorRatio: (Number.isFinite(awayYearStats.statistics[0].winnersTotal) && Number.isFinite(awayYearStats.statistics[0].unforcedErrorsTotal))
                                ? goodNum(awayYearStats.statistics[0].winnersTotal / awayYearStats.statistics[0].unforcedErrorsTotal)
                                : undefined
                        }

                    } : {},
                    currentSeasonStats: sA ? {
                        matches: sA.matches ?? undefined,

                        performance: {
                            winRate: (Number.isFinite(sA.wins) && Number.isFinite(sA.matches))
                                ? goodNum(sA.wins / sA.matches)
                                : undefined
                        },

                        serve: {
                            aceRate: (Number.isFinite(sA.aces) && Number.isFinite(sA.totalServeAttempts))
                                ? goodNum(sA.aces / sA.totalServeAttempts)
                                : undefined,

                            doubleFaultRate: (Number.isFinite(sA.doubleFaults) && Number.isFinite(sA.totalServeAttempts))
                                ? goodNum(sA.doubleFaults / sA.totalServeAttempts)
                                : undefined,

                            firstServeInRate: Number.isFinite(sA.firstServePercentage)
                                ? goodNum(sA.firstServePercentage / 100)
                                : undefined,

                            firstServeWinRate: Number.isFinite(sA.firstServePointsWonPercentage)
                                ? goodNum(sA.firstServePointsWonPercentage / 100)
                                : undefined,

                            secondServeWinRate: Number.isFinite(sA.secondServePointsWonPercentage)
                                ? goodNum(sA.secondServePointsWonPercentage / 100)
                                : undefined,

                            servicePointsWinRate: (
                                Number.isFinite(sA.firstServePointsScored) &&
                                Number.isFinite(sA.secondServePointsScored) &&
                                Number.isFinite(sA.firstServePointsTotal) &&
                                Number.isFinite(sA.secondServePointsTotal)
                            )
                                ? goodNum(
                                    (sA.firstServePointsScored + sA.secondServePointsScored) /
                                    (sA.firstServePointsTotal + sA.secondServePointsTotal)
                                )
                                : undefined
                        },

                        pressure: {
                            breakPointConversion: Number.isFinite(sA.breakPointsSavedConvertedPercentage)
                                ? goodNum(sA.breakPointsSavedConvertedPercentage / 100)
                                : undefined,

                            breakPointDefense: Number.isFinite(sA.breakPointsSavedPercentage)
                                ? goodNum(sA.breakPointsSavedPercentage / 100)
                                : undefined,

                            tiebreakWinRate: Number.isFinite(sA.tiebreakWinPercentage)
                                ? goodNum(sA.tiebreakWinPercentage / 100)
                                : undefined
                        }

                    } : undefined,
                    rankings: (rankingsAway && rankingsAway.rankings && Array.isArray(rankingsAway.rankings)) ? rankingsAway.rankings.map(r => {
                        return {
                            bestRanking: r.bestRanking ?? undefined,
                            country: r.country?.name ?? undefined,
                            points: r.points ?? undefined,
                            previousPoints: r.previousPoints ?? undefined,
                            previousRanking: r.previousRanking ?? undefined,
                            ranking: r.ranking ?? undefined,
                            rankingClass: r.rankingClass ?? undefined,
                            tournamentsPlayed: r.tournamentsPlayed ?? undefined,
                        }
                    }) : undefined
                },
                headToHead: (h2h && h2h.teamDuel) ? {
                    totalMeetings: h2h.teamDuel.homeWins + h2h.teamDuel.awayWins + h2h.teamDuel.draws,
                    homeWins: h2h.teamDuel.homeWins,
                    awayWins: h2h.teamDuel.awayWins,
                    draws: h2h.teamDuel.draws,
                } : {},
                platformVotes: (votes && votes.vote) ? {
                    winner: {
                        home: votes.vote.vote1 ?? undefined,
                        away: votes.vote.vote2 ?? undefined,
                        draw: votes.vote.voteX ?? undefined,
                    },
                } : undefined,
            };

            return response;
        } catch (error) {
            Log.dev(error);
            return null;
        }
    }

    private static getToday = (date: Date = new Date()) => {
        const y = date.getFullYear().toString();
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const d = date.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    private static fetchJson = async (url: string, attempt = 1): Promise<any> => {
        const MAX_RETRIES = 5;
        const RETRY_DELAY = 5000; // 5s

        try {
            const json = await SofascoreEngine.request(url);
            if (!json) throw new Error(`Empty or invalid response for ${url}`);
            return json;
        } catch (error: any) {
            if (attempt < MAX_RETRIES) {
                const delay = RETRY_DELAY * attempt;
                await SofascoreEngine.sleep(delay);
                return SofascoreEngine.fetchJson(url, attempt + 1);
            }
            throw error;
        }
    };

    private static request = async (url: string, headers: Record<string, string> = {}, json: boolean = true): Promise<any> => {
        try {
            const response = await SofascoreEngine.session.get(url, {
                headers: {
                    "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "accept": "application/json",
                    ...headers
                }
            });

            if (response.status !== 200) {
                if (response.status !== 404) {
                    Log.dev(`Unexpected status ${response.status}: ${url}`);
                }
                return null;
            }

            const text = await response.text();
            if (!json) {
                return text;
            }
            if (!text || text.length < 10) return null;

            return JSON.parse(text);
        } catch (error) {
            throw error;
        }
    }

    private static initTournaments = async (dateStr: string) => {
        if (SofascoreEngine.tournamentsByDate.has(dateStr)) return;

        const tournamentsUrl = `https://api.sofascore.com/api/v1/sport/tennis/scheduled-tournaments/${dateStr}`;
        try {
            Log.flow([SLUG, `Fetching tournament list for ${dateStr}...`], WEIGHT);
            const tournamentsData = await SofascoreEngine.fetchJson(tournamentsUrl);

            if (tournamentsData && tournamentsData.scheduled) {
                const tournaments = tournamentsData.scheduled.map((t: any) => t.tournament).filter(Boolean);
                SofascoreEngine.tournamentsByDate.set(dateStr, tournaments);
                Log.flow([SLUG, `Found ${tournaments.length} tournaments for ${dateStr}.`], WEIGHT);
            } else {
                SofascoreEngine.tournamentsByDate.set(dateStr, []);
            }
        } catch (error: any) {
            Log.dev(`Failed to fetch tournaments for ${dateStr}: ${error.message}`);
            // Don't set empty array here if it was a network error, maybe retry later?
            // But for now, let's treat it as empty to avoid infinite loops if requested again.
            SofascoreEngine.tournamentsByDate.set(dateStr, []);
        }
    }

    private static ensureTournamentEvents = async (tournament: Tournament, dateStr: string) => {
        const tid = tournament.uniqueTournament?.id ?? tournament.id;
        const isUnique = !!tournament.uniqueTournament;

        const fetchedSet = SofascoreEngine.fetchedTournamentsPerDate.get(dateStr) || new Set();
        if (fetchedSet.has(tid)) return;

        // Use correct endpoint based on ID type
        const endpointType = isUnique ? "unique-tournament" : "tournament";
        const url = `https://api.sofascore.com/api/v1/${endpointType}/${tid}/scheduled-events/${dateStr}`;

        try {
            Log.flow([SLUG, `On-demand fetching events for ${tournament.name} (${tid}) on ${dateStr}...`], WEIGHT);
            const data = await SofascoreEngine.fetchJson(url);

            // Mark as fetched even if data is null/empty to avoid repeated 404/failure hits
            fetchedSet.add(tid);
            SofascoreEngine.fetchedTournamentsPerDate.set(dateStr, fetchedSet);

            if (data && data.events) {
                const matches: Match[] = data.events.filter((event: Event) => event.status.code == 0).map((event: Event) => {
                    return {
                        home: normalizeName(event.homeTeam.name),
                        homeId: event.homeTeam.id,
                        away: normalizeName(event.awayTeam.name),
                        awayId: event.awayTeam.id,
                        id: event.id,
                        slug: event.slug,
                        startTime: event.startTimestamp * 1000,
                        league: normalizeName(event.tournament.name),
                        leagueId: event.tournament.id,
                        customId: event.customId,
                        season: event.season.name,
                        seasonId: event.season.id,
                        tId: event.tournament.uniqueTournament?.id ?? event.tournament.id,
                    };
                });

                // Update matchesByTeam and matchesByID
                for (const m of matches) {
                    if (!SofascoreEngine.matchesByID.has(m.id)) {
                        SofascoreEngine.matchesByID.set(m.id, m);

                        const updateTeamMatches = (team: string, match: Match) => {
                            if (!SofascoreEngine.matchesByTeam.has(team)) {
                                SofascoreEngine.matchesByTeam.set(team, []);
                            }
                            SofascoreEngine.matchesByTeam.get(team)!.push(match);
                        }
                        updateTeamMatches(m.home, m);
                        updateTeamMatches(m.away, m);
                    }
                }
                Log.flow([SLUG, `Fetched ${matches.length} events for ${tournament.name} on ${dateStr}.`], WEIGHT);
            }
        } catch (e: any) {
            Log.dev(`Failed to fetch events for tournament ${tid} on ${dateStr}: ${e.message}`);
            // Still mark as fetched to avoid being stuck in a retry loop if it's a 404
            fetchedSet.add(tid);
            SofascoreEngine.fetchedTournamentsPerDate.set(dateStr, fetchedSet);
        }
    }

    private static lastFetchDay: string = ``;

    private static dataDirectory = path.join(Site.ROOT, ".data");


    static start = () => new Promise<boolean>(async (resolve, reject) => {

        if (Site.GROQ_USE) {
            if (!existsSync(SofascoreEngine.dataDirectory)) {
                mkdirSync(SofascoreEngine.dataDirectory, { recursive: true });
            }

            const loadFile = () => new Promise<boolean>((res, rej) => {
                if (existsSync(SofascoreEngine.file)) {
                    readFile(SofascoreEngine.file, "utf8", (err, data) => {
                        if (err) {
                            Log.dev(err.message || err);
                            res(false);
                        }
                        else {
                            try {
                                const today = SofascoreEngine.getToday();
                                const d = JSON.parse(data);
                                SofascoreEngine.lastFetchDay = d.day;

                                // Load matches
                                if (d.matches && Array.isArray(d.matches)) {
                                    SofascoreEngine.matches2pointers(d.matches);
                                    Log.flow([SLUG, `Loaded persisted matches`, `Count = ${d.matches.length}.`], WEIGHT);
                                }

                                // Load tournaments
                                if (d.tournaments) {
                                    for (const [date, tournaments] of Object.entries(d.tournaments)) {
                                        if (date >= today) {
                                            SofascoreEngine.tournamentsByDate.set(date, tournaments as Tournament[]);
                                        }
                                    }
                                }

                                // Load fetched status
                                if (d.fetched) {
                                    for (const [date, ids] of Object.entries(d.fetched)) {
                                        if (date >= today) {
                                            SofascoreEngine.fetchedTournamentsPerDate.set(date, new Set(ids as number[]));
                                        }
                                    }
                                }

                            } catch (error) {
                                Log.dev(`Failed to parse persistence file: ${error}`);
                            }
                            res(true);
                        }
                    });
                }
                else {
                    res(true);
                }
            });
            const ensureSession = () => new Promise<boolean>(async (res, rej) => {
                try {
                    await initTLS();
                    SofascoreEngine.session = new Session({
                        clientIdentifier: ClientIdentifier.chrome_120,
                        randomTlsExtensionOrder: true
                    });
                    res(true);
                } catch (error: any) {
                    Log.dev(error.message || error);
                    res(false);
                }
            })
            const loaded = (await loadFile()) && (await ensureSession());
            if (loaded) {
                if (SofascoreEngine.matchesByID.size == 0) {
                    SofascoreEngine.run();
                }
                else {
                    const msToNextMidnight = (new Date().setHours(24, 0, 0, 0)) - Date.now();
                    setTimeout(() => {
                        SofascoreEngine.run();
                    }, msToNextMidnight);
                    Log.flow([SLUG, `Fetch scheduled in ${getTimeElapsed(0, msToNextMidnight)}.`], WEIGHT);
                }
            }
            resolve(loaded);
        }
        else {
            resolve(true);
        }
    });

    static get = async ({
        away,
        home,
        league,
        startTime
    }: {
        home: string;
        away: string;
        league: string;
        startTime: number;
    }): Promise<Extracted | null> => {
        const event = `${home} vs ${away}`;
        const date = new Date(startTime);
        const dateStr = SofascoreEngine.getToday(date);


        

        home = cleaner(home);
        away = cleaner(away);
        league = cleaner(league);

        // Ensure tournaments for this date are loaded
        await SofascoreEngine.initTournaments(dateStr);

        // Find match candidates (multiple tournament IDs may be returned)
        const candidates = SofascoreEngine.findTournamentMatches(league, dateStr);
        if (candidates.length > 0) {
            // Ensure events for all matched tournaments are loaded
            await Promise.all(candidates.map(t => SofascoreEngine.ensureTournamentEvents(t, dateStr)));
        }

        const match = SofascoreEngine.findMatch(home, away, league, startTime);
        if (match) {
            Log.flow([SLUG, event, `Match found. extracting stats.`], WEIGHT);
            const s = await SofascoreEngine.getMatchData(match);
            if (s) {
                Log.flow([SLUG, event, `Stats found.`], WEIGHT);
            }
            else {
                Log.flow([SLUG, event, `Stats not found.`], WEIGHT);
            }
            return s;
        }
        else {
            Log.flow([SLUG, event, `Match not found.`], WEIGHT);
        }
        return null;
    }

    private static cleanLeagueName = (name: string): string => {
        const cleaned = name.toLowerCase()
            .replace(/\b(league|cup|division|divisione|liga|primera|super|premier|championship|qualification|group|stage|playoffs|women|youth|u[0-9]+|national|pro|league 1|league 2|league one|league two|major|serie a|serie b|eredivisie|primeira|ligue 1|ligue 2)\b/g, "")
            .replace(/[^a-z0-9 ]/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        // Fallback to normalized name if cleaning results in empty string (e.g. for "Championship")
        return cleaner(cleaned || name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim());
    }

    private static findTournamentMatches = (league: string, dateStr: string): Tournament[] => {
        const list = SofascoreEngine.tournamentsByDate.get(dateStr) || [];
        if (list.length === 0) return [];

        const target = SofascoreEngine.cleanLeagueName(league);
        const originalTarget = league.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
        if (!target) return [];

        const multiMatch = (useCleaned: boolean): { tournament: Tournament; score: number }[] => {
            const matches: { tournament: Tournament; score: number }[] = [];
            const seenIDs = new Set<number>();
            const currentTarget = useCleaned ? target : originalTarget;
            const targetWords = currentTarget.split(" ");

            for (const t of list) {
                const tid = t.uniqueTournament?.id ?? t.id;
                if (seenIDs.has(tid)) continue;

                const name1 = useCleaned ? SofascoreEngine.cleanLeagueName(t.name) : t.name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
                const name2 = t.uniqueTournament ? (useCleaned ? SofascoreEngine.cleanLeagueName(t.uniqueTournament.name) : t.uniqueTournament.name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()) : "";

                const score1 = stringSimilarity.compareTwoStrings(currentTarget, name1);
                const score2 = name2 ? stringSimilarity.compareTwoStrings(currentTarget, name2) : 0;
                
                // Word coverage check as fallback
                const words1 = name1.split(" ");
                const words2 = name2 ? name2.split(" ") : [];
                
                const getCoverage = (tw: string[], cw: string[]) => {
                    if (cw.length === 0) return 0;
                    const matches = cw.filter(w => tw.includes(w)).length;
                    return matches / cw.length;
                };
                
                const coverage1 = getCoverage(targetWords, words1);
                const coverage2 = getCoverage(targetWords, words2);
                
                const score = Math.max(score1, score2, coverage1 > 0.8 ? 0.85 : 0, coverage2 > 0.8 ? 0.85 : 0);

                if (score > 0.6) {
                    matches.push({ tournament: t, score });
                    seenIDs.add(tid);
                }
            }
            return matches;
        };

        // Pass 1: Match against cleaned names
        let matches = multiMatch(true);

        // Pass 2: If no strong matches found, try original names
        if (matches.length === 0 || matches[0].score < 0.7) {
            const fallbackMatches = multiMatch(false);
            if (fallbackMatches.length > 0 && (matches.length === 0 || fallbackMatches[0].score > matches[0].score)) {
                matches = fallbackMatches;
            }
        }

        matches.sort((a, b) => b.score - a.score);

        if (matches.length > 0) {
            const bestScore = matches[0].score;
            return matches
                .filter(m => m.score > 0.8 || (bestScore - m.score < 0.15))
                .map(m => m.tournament);
        }

        return [];
    }

    private static findMatch = (home: string, away: string, league: string, startTime: number): Match | null => {
        return findBestMatch(home, away, startTime, Array.from(SofascoreEngine.matchesByID.values()));
    };

    private static TIMEOUT = 30000;

    private static sleep = (ms: number) =>
        new Promise(res => setTimeout(res, ms));

    private static fetch = async (): Promise<any | null> => {
        // Now purely on-demand via get() -> initTournaments()
        return { success: true };
    };

    private static run = async () => {
        const start = Date.now();
        const conclude = () => {
            Log.flow([SLUG, `Iteration`, `Concluded.`], WEIGHT);
            const interval = 1000 * 60 * 60 * 24;
            const duration = Date.now() - start;
            if (duration >= interval) {
                SofascoreEngine.run();
            }
            else {
                const timeToGetThere = interval - duration;
                setTimeout(() => {
                    SofascoreEngine.run();
                }, timeToGetThere);
            }
        }
        Log.flow([SLUG, `Iteration`, `Initialized.`], WEIGHT);

        // Clean up old dates
        const today = SofascoreEngine.getToday();
        for (const date of SofascoreEngine.tournamentsByDate.keys()) {
            if (date < today) {
                SofascoreEngine.tournamentsByDate.delete(date);
                SofascoreEngine.fetchedTournamentsPerDate.delete(date);
            }
        }

        SofascoreEngine.lastFetchDay = today;
        conclude();
    }

    static stop = async (): Promise<boolean> => {
        // 1️⃣ Persist matches and tournaments
        const tournaments: Record<string, Tournament[]> = {};
        for (const [date, list] of SofascoreEngine.tournamentsByDate.entries()) {
            tournaments[date] = list;
        }

        const fetched: Record<string, number[]> = {};
        for (const [date, set] of SofascoreEngine.fetchedTournamentsPerDate.entries()) {
            fetched[date] = Array.from(set);
        }

        const data = {
            day: SofascoreEngine.lastFetchDay,
            matches: Array.from(SofascoreEngine.matchesByID.values()),
            tournaments,
            fetched
        };
        writeFileSync(SofascoreEngine.file, JSON.stringify(data), 'utf8');
        Log.flow([SLUG, `Persisted data`, `Matches = ${data.matches.length}, Tournaments = ${Object.keys(tournaments).length}.`], WEIGHT);

        // 3️⃣ Close pages and contexts safely
        try {
            if (SofascoreEngine.session) {
                SofascoreEngine.session.close();
            }
        } catch (err) {
            console.error('Error closing session:', err);
        }

        return true;
    };
}