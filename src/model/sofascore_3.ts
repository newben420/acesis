/*
https://www.sofascore.com/api/v1/event/15624985/votes eventid
// https://www.sofascore.com/api/v1/team/338500/team-statistics/seasons teamid
https://www.sofascore.com/api/v1/event/15624985/h2h eventid
https://www.sofascore.com/api/v1/team/338500/unique-tournament/2487/season/80797/statistics/overall teamid tid seasonid
https://www.sofascore.com/api/v1/team/338500/rankings teamid
https://www.sofascore.com/api/v1/team/206570/year-statistics/2026 teamid year
https://www.sofascore.com/api/v1/team/237452/events/last/0 teamid --- can be used to calcultae pregame form
*/

import { Changes, EventFilters, RoundInfo, Status, Time, Tournament } from "./sofascore";

export interface VotesResponse {
    vote: Vote;
    bothTeamsToScoreVote: BothTeamsToScoreVote;
    firstTeamToScoreVote: FirstTeamToScoreVote;
    whoShouldHaveWonVote: WhoShouldHaveWonVote;
}

export interface TeamStatsSessionResponse {
    uniqueTournamentSeasons: UniqueTournamentSeason[];
}

export interface H2HResponse {
    teamDuel: TeamDuel | null;
    managerDuel: TeamDuel | null;
}

export interface OverallResponse {
    statistics: Statistics;
}

export interface RankingsResponse {
    rankings: Ranking[];
}

export interface YearStatsResponse {
    statistics: YearStats[];
}

export interface TeamLastEventsResponse {
    events: Event[];
}



interface UniqueTournament {
    name: string;
    slug: string;
    primaryColorHex?: string;
    secondaryColorHex?: string;
    category: Category;
    userCount: number;
    tennisPoints: number;
    id: number;
    displayInverseHomeAwayTeams: boolean;
    fieldTranslations: FieldTranslations;
    groundType?: string;
    hasPerformanceGraphFeature?: boolean;
    hasEventPlayerStatistics?: boolean;
    ountry?: Country;
}

interface Event {
    tournament: Tournament;
    season: Season;
    roundInfo: RoundInfo;
    customId: string;
    status: Status;
    winnerCode: number;
    homeTeam: Team;
    awayTeam: Team;
    homeScore: Score;
    awayScore: Score;
    time: Time;
    changes: Changes;
    hasGlobalHighlights: boolean;
    crowdsourcingDataDisplayEnabled: boolean;
    id: number;
    slug: string;
    startTimestamp: number;
    periods: Periods;
    finalResultOnly: boolean;
    feedLocked: boolean;
    groundType: string;
    isEditor: boolean;
    eventFilters: EventFilters;
    firstToServe?: number;
    homeTeamSeed?: string;
    awayTeamSeed?: string;
}

interface Periods {
    [k: string]: string;
}

interface Country {
    alpha2?: string;
    alpha3?: string;
    name?: string;
    slug?: string;
}
interface Sport {
    name: string;
    slug: string;
    id: number;
}
interface Season {
    name: string;
    year: string;
    editor: boolean;
    id: number;
}
interface Score {
    current: number;
    display: number;
    period1: number;
    period2: number;
    point: string;
    normaltime: number;
    period3?: number;
    period2TieBreak?: number;
    period3TieBreak?: number;
}
interface FieldTranslations {
    nameTranslation?: Record<string, string>;
    shortNameTranslation?: Record<string, string>;
}

interface YearStats {
    totalServeAttempts: number;
    tiebreakLosses: number;
    tiebreaksWon: number;
    wins: number;
    aces: number;
    firstServePointsScored: number;
    firstServePointsTotal: number;
    firstServeTotal: number;
    secondServePointsScored: number;
    secondServePointsTotal: number;
    secondServeTotal: number;
    breakPointsScored: number;
    breakPointsTotal: number;
    opponentBreakPointsTotal: number;
    opponentBreakPointsScored: number;
    doubleFaults: number;
    matches: number;
    groundType: string;
    tournamentsWon: number;
    tournamentsPlayed: number;
    winnersTotal: number;
    unforcedErrorsTotal: number;
}
interface Ranking {
    team: Team;
    type: number;
    rowName: string;
    ranking: number;
    points: number;
    id: number;
    rankingClass: string;
    tournamentsPlayed?: number;
    previousRanking?: number;
    previousPoints?: number;
    bestRanking?: number;
    country?: Country;
    nextWinPoints?: number;
    maxPoints?: number;
    bestRankingDateTimestamp?: number;
}

interface Team {
    name: string;
    slug: string;
    shortName: string;
    gender: string;
    sport: Sport;
    userCount: number;
    nameCode: string;
    ranking: number;
    disabled: boolean;
    national: boolean;
    type: number;
    country: Country;
    id: number;
    teamColors: TeamColors;
    fieldTranslations: FieldTranslations;
}

interface Country {
    alpha2?: string;
    alpha3?: string;
    name?: string;
    slug?: string;
}

interface TeamColors {
    primary: string;
    secondary: string;
    text: string;
}

interface Statistics {
    totalServeAttempts: number;
    tiebreakLosses: number;
    tiebreaksWon: number;
    wins: number;
    aces: number;
    firstServePointsScored: number;
    firstServePointsTotal: number;
    firstServeTotal: number;
    secondServePointsScored: number;
    secondServePointsTotal: number;
    secondServeTotal: number;
    breakPointsScored: number;
    breakPointsTotal: number;
    opponentBreakPointsTotal: number;
    opponentBreakPointsScored: number;
    doubleFaults: number;
    avgDoubleFaults: number;
    firstServePercentage: number;
    firstServePointsWonPercentage: number;
    secondServePercentage: number;
    secondServePointsWonPercentage: number;
    avgAces: number;
    breakPointsSavedPercentage: number;
    breakPointsSavedConvertedPercentage: number;
    tiebreakWinPercentage: number;
    id: number;
    matches: number;
    awardedMatches: number;
    statisticsType: StatisticsType;
}

interface StatisticsType {
    sportSlug: string;
    statisticsType: string;
}

interface TeamDuel {
    homeWins: number;
    awayWins: number;
    draws: number;
}

interface UniqueTournamentSeason {
    uniqueTournament: UniqueTournament;
    seasons: Season[];
}

interface UniqueTournament {
    name: string;
    slug: string;
    primaryColorHex?: string;
    secondaryColorHex?: string;
    category: Category;
    userCount: number;
    tennisPoints: number;
    id: number;
    displayInverseHomeAwayTeams: boolean;
    fieldTranslations: FieldTranslations;
}

interface Category {
    name: string;
    slug: string;
    sport: Sport;
    id: number;
    flag: string;
    fieldTranslations: FieldTranslations;
}

interface Sport {
    name: string;
    slug: string;
    id: number;
}

interface FieldTranslations {
    nameTranslation?: Record<string, string>;
    shortNameTranslation?: Record<string, string>;
}

interface Season {
    name: string;
    year: string;
    editor: boolean;
    id: number;
}

interface Vote {
    vote1: number;
    vote2: number;
    voteX: number | null;
}

interface BothTeamsToScoreVote {
    voteYes: number;
    voteNo: number;
}

interface FirstTeamToScoreVote {
    voteHome: number;
    voteNoGoal: number;
    voteAway: number;
}

interface WhoShouldHaveWonVote {
    vote1: number;
    vote2: number;
}