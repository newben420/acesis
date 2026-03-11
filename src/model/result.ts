export type CodeState = 0 | // pending
    1 | // running
    2 | // done
    3 | // retry
    4 | // failed
    5; // cancelled

export interface SubFixture {
    eventId: string;
    startTime: number;
    retries?: number;
}

export interface WaitingSets {
    fixtures: SubFixture[];
    startTime: number;
}

export interface Checker {
    timestamp: number;
    state: CodeState;
}

export interface Booking {
    code: string;
    checkers: Checker[];
}

export interface ResultDB {
    waiting?: WaitingSets;
    bookings?: Booking[];
}

export interface LoadSelectionsResponse {
    bizCode: number
    isAvailable: boolean
    message: string
    data: Data
}

export interface Data {
    shareCode: string
    shareURL: string
    ticket: Ticket
    deadline: number
    outcomes: Outcome[]
    unavailableOutcomes: any[]
}

export interface Ticket {
    selections: Selection[]
}

export interface Selection {
    eventId: string
    marketId: string
    outcomeId: string
    specifier?: any
    parentBetBuilderMarketId?: string
    sportId?: string
}

export interface Outcome {
    eventId: string
    gameId: string
    productStatus?: string
    estimateStartTime?: number
    status: number
    setScore?: string
    gameScore?: string[]
    pointScore?: string
    period?: string
    matchStatus: string
    playedSeconds?: string
    remainingTimeInPeriod?: string
    homeTeamName: string
    awayTeamName: string
    sport: Sport
    markets: Market[]
    bookingStatus: string
    bgEvent: boolean
    matchTrackerNotAllowed: boolean
    eventSource: EventSource
    banned: boolean
}

export interface Sport {
    id: string
    name: string
    category: Category
}

export interface Category {
    id: string
    name: string
    tournament: Tournament
}

export interface Tournament {
    id: string
    name: string
}

export interface Market {
    id: string
    product: number
    desc: string
    status: number
    group?: string
    marketGuide?: string
    favourite: number
    outcomes: MarketOutcome[]
    marketExtendVOS?: MarketExtendVO[]
    sourceType: string
    lastOddsChangeTime: number
    banned: boolean
}

export interface MarketOutcome {
    id: string
    odds: string
    probability: string
    voidProbability: string
    isActive: number
    desc: string
    isWinning: number
    refundFactor: number
}

export interface MarketExtendVO {
    name: string
    notSupport: boolean
}

export interface EventSource {
    preMatchSource: Source
    liveSource: Source
}

export interface Source {
    sourceType: string
    sourceId: string
}