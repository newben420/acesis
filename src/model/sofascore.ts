export interface Match {
    id: number;
    league: string;
    leagueId: number;
    home: string;
    homeId: number;
    away: string;
    season: string;
    seasonId: number;
    awayId: number;
    slug: string;
    startTime: number;
    customId: string;
    tId: number;
}

export interface SofaScoreResponse {
    events: Event[];
}

export interface Event {
    tournament: Tournament;
    season: Season;
    roundInfo?: RoundInfo;
    customId: string;
    status: Status;
    winnerCode?: number;
    homeTeam: Team;
    awayTeam: Team;
    homeScore?: Score;
    awayScore?: Score;
    time?: Time;
    changes?: Changes;
    hasGlobalHighlights?: boolean;
    hasXg?: boolean;
    hasEventPlayerStatistics?: boolean;
    hasEventPlayerHeatMap?: boolean;
    detailId: number;
    crowdsourcingDataDisplayEnabled?: boolean;
    id: number;
    homeRedCards?: number;
    slug: string;
    startTimestamp: number;
    finalResultOnly: boolean;
    feedLocked: boolean;
    isEditor: boolean;
    eventFilters?: EventFilters;
}

export interface Tournament {
    name: string;
    slug: string;
    category: Category;
    uniqueTournament?: UniqueTournament;
    priority?: number;
    id: number;
    fieldTranslations?: FieldTranslations;
}

export interface UniqueTournament {
    name: string;
    slug: string;
    category: Category;
    userCount?: number;
    hasPerformanceGraphFeature?: boolean;
    country?: Record<string, unknown>;
    id: number;
    hasEventPlayerStatistics?: boolean;
    displayInverseHomeAwayTeams?: boolean;
    fieldTranslations?: FieldTranslations;
}

export interface Category {
    name: string;
    slug: string;
    sport: Sport;
    country: Country;
    id: number;
    flag?: string;
    alpha2?: string;
    fieldTranslations?: FieldTranslations;
}

export interface Sport {
    name: string;
    slug: string;
    id: number;
}

export interface Country {
    alpha2: string;
    alpha3: string;
    name: string;
    slug: string;
}

export interface FieldTranslations {
    nameTranslation?: Record<string, string>;
    shortNameTranslation?: Record<string, string>;
}

export interface Season {
    name: string;
    year: string;
    editor: boolean;
    id: number;
}

export interface RoundInfo {
    round: number;
}

export interface Status {
    code: number;
    description: string;
    type: string;
}

export interface Team {
    name: string;
    slug: string;
    shortName: string;
    gender: string;
    sport: Sport;
    userCount?: number;
    nameCode?: string;
    disabled?: boolean;
    national?: boolean;
    type?: number;
    country: Country;
    id: number;
    subTeams?: Team[];
    teamColors?: TeamColors;
    fieldTranslations?: FieldTranslations;
}

export interface TeamColors {
    primary: string;
    secondary: string;
    text: string;
}

export interface Score {
    current?: number;
    display?: number;
    period1?: number;
    period2?: number;
    normaltime?: number;
}

export interface Time {
    injuryTime1?: number;
    injuryTime2?: number;
    currentPeriodStartTimestamp?: number;
}

export interface Changes {
    changes?: string[];
    changeTimestamp: number;
}

export interface EventFilters {
    category?: string[];
    level?: string[];
    gender?: string[];
}