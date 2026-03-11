/** Generic API envelope (composable) */
export interface ApiResponse<TData> {
    bizCode: number;
    message: string;
    data: TData;
}

/** Convenience: this specific response type */
export type UpcomingResponse = ApiResponse<TournamentsData>;

/** ---------------- Domain ---------------- */

export interface TournamentsData {
    totalNum: number;
    tournaments: Tournament[];
}

export interface Tournament {
    id: string; // e.g. "sr:tournament:17"
    name: string;
    events: Event[];
    categoryName: string;
    categoryId: string; // e.g. "sr:category:1"
}

export type MatchStatusText = "Not start" | string;
export type BookingStatus = "Booked" | string;

export interface Event {
    eventId: string; // e.g. "sr:match:61301003"
    gameId: string;
    productStatus: string; // e.g. "0#0"
    estimateStartTime: number; // epoch ms
    status: number;
    matchStatus: MatchStatusText;

    homeTeamId: string;
    homeTeamName: string;
    awayTeamId: string;
    awayTeamName: string;

    sport: SportNode;

    totalMarketSize: number;
    markets: Market[];

    bookingStatus: BookingStatus;
    topTeam: boolean;
    commentsNum: number;
    topicId: number;

    fixtureVenue: FixtureVenue;

    giftGrabActivityResultVO: GiftGrabActivityResult;

    ai: boolean;
    bgEvent: boolean;
    matchTrackerNotAllowed: boolean;

    eventSource: EventSource;

    banned: boolean;
}

export interface SportNode {
    id: string;   // e.g. "sr:sport:1"
    name: string; // e.g. "Football"
    category: SportCategory;
}

export interface SportCategory {
    id: string;   // e.g. "sr:category:1"
    name: string; // e.g. "England"
    tournament: SportTournamentRef;
}

export interface SportTournamentRef {
    id: string;
    name: string;
}

/** ---------------- Markets ---------------- */

export type MarketStatus = number; // observed: 0, 2
export type MarketGroup = "Main" | "Combo" | string;
export type SourceType = "BET_RADAR" | "BET_GENIUS" | string;

export interface Market {
    /** NOTE: `id` is NOT unique globally (e.g. many "18" with different `specifier`). */
    id: string;

    /** Used for variants like O/U totals, handicap lines, etc. */
    specifier?: string;

    product: number;
    desc: string;
    status: MarketStatus;

    group: MarketGroup;
    groupId: string;

    marketGuide: string;

    title: string;
    name: string;

    favourite: 0 | 1 | number;

    outcomes: Outcome[];

    farNearOdds: number;

    marketExtendVOS?: MarketExtendVO[];

    sourceType: SourceType;
    lastOddsChangeTime: number; // epoch ms

    earlyPayoutMarkets?: EarlyPayoutMarket[];

    banned: boolean;
}

export interface Outcome {
    id: string;
    odds: string; // numeric string
    probability: string; // decimal string
    voidProbability: string; // e.g. "0E-10"
    isActive: 0 | 1 | number;

    cashOutIsActive?: 0 | 1 | number;

    desc: string;
}

export interface MarketExtendVO {
    name: string; // e.g. "1UP" | "2UP"
    rootMarketId: string;
    nodeMarketId: string;
    notSupport: boolean;
}

export interface EarlyPayoutMarket {
    name: string; // e.g. "over_under"
    sourceMarketId: string;
    sourceSpecifier: string;
    mappedMarketId: string;
    mappedSpecifier: string;
}

/** ---------------- Misc ---------------- */

export interface FixtureVenue {
    name: string;
}

export interface GiftGrabActivityResult {
    activityEnabled: boolean;
    enabled: boolean;
}

export interface EventSource {
    preMatchSource: SourceRef;
    liveSource: SourceRef;
}

export interface SourceRef {
    sourceType: SourceType;
    sourceId: string;
}

/** ---------------- Optional helpers ---------------- */

/** Stable “key” for a market inside an event (since `id` can repeat with different specifiers). */
export type MarketKey = `${string}`; // you can use buildMarketKey(m) below

export const buildMarketKey = (m: Pick<Market, "id" | "specifier">): MarketKey =>
    (m.specifier ? `${m.id}::${m.specifier}` : m.id) as MarketKey;

export type ResultsResponse = ApiResponse<ResultsData>;

export interface ResultsData {
    totalNum: number;
    tournaments: ResultsTournament[];
}

export interface ResultsTournament {
    id: string;
    name: string;
    events: ResultEvent[];
    categoryName: string;
    categoryId: string;
}

/**
 * Score strings are consistently "N:M" in your samples.
 * Keep as string to avoid parsing assumptions; you can add helpers later.
 */
export type ScoreString = `${number}:${number}` | string;

/** Match lifecycle text seen in samples */
export type ResultMatchStatus = "Ended" | "Cancelled" | string;

/** Status codes observed: 4 (ended), 5 (cancelled) */
export type ResultStatusCode = 4 | 5 | number;

export interface ResultEvent {
    eventId: string;
    gameId: string;
    estimateStartTime: number; // epoch ms

    status: ResultStatusCode;
    matchStatus: ResultMatchStatus;

    homeTeamName: string;
    awayTeamName: string;

    sport: SportNode;

    /**
     * Present for ended games in sample.
     * For cancelled, it's shown as "0:0" (still present), but treat optional to be safe.
     */
    setScore?: ScoreString;

    /**
     * Per-period scores for ended games (e.g. halves).
     * Optional because cancelled example doesn’t have it.
     */
    gameScore?: ScoreString[];

    /**
     * Present on ended games in sample (array with one item).
     * Optional for safety.
     */
    regularTimeScore?: ScoreString[];

    /**
     * Present on cancelled sample as empty string.
     * Optional because ended samples don’t include it.
     */
    pointScore?: string;

    ai: boolean;
    bgEvent: boolean;
    matchTrackerNotAllowed: boolean;

    eventSource: EventSource;

    banned: boolean;
}

/** Optional: discriminated union for stricter handling */
export type ResultEventStrict = ResultEventEnded | ResultEventCancelled;

export interface ResultEventEnded extends Omit<ResultEvent, "matchStatus" | "status"> {
    matchStatus: "Ended";
    status: 4;
    setScore: ScoreString;
    gameScore: ScoreString[];
    regularTimeScore?: ScoreString[];
}

export interface ResultEventCancelled extends Omit<ResultEvent, "matchStatus" | "status"> {
    matchStatus: "Cancelled";
    status: 5;
    pointScore?: string;
    gameScore?: undefined;
    regularTimeScore?: undefined;
}

export type Odds = {
    homeWin?: number
    awayWin?: number
}

export type Fixture = {
    eventId: string
    gameID: string
    league: string
    home: string
    away: string
    startTime: number
    odds: Odds
    homeGoals?: number
    awayGoals?: number
    homeScore?: number
    awayScore?: number
    score?: number
    resultCheckedCount?: number
    llmAttempted?: boolean;
    hasVerdict?: boolean;
    isTurnedOff?: boolean;
    llmWinner?: number;
}

export type HistoricalFixture = Fixture & {
    homeGoals: number
    awayGoals: number
}

export type FullFixture = Fixture & {
    verdict?: string;
    extractedData?: any;
}
