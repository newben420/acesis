export interface FeaturedPlayersResponse {
    featuredPlayers: Record<string, FeaturedPlayer>;
}

export interface H2HResponse {
    teamDuel: Duel;
    managerDuel: Duel;
}

export interface MatchLineupResponse {
    confirmed: boolean;
    home: TeamLineup;
    away: TeamLineup;
}

export interface MatchManagersResponse {
    homeManager: Manager;
    awayManager: Manager;
}

export interface PregameResponse {
    homeTeam: TeamStanding;
    awayTeam: TeamStanding;
    label: string;
}

export interface OverallResponse {
    statistics: TeamStatistics;
}

export interface StandingsResponse {
    standings: Standing[];
}

interface Sport {
    name: string;
    slug: string;
    id: number;
}

interface TeamColors {
    primary: string;
    secondary: string;
    text: string;
}

interface NameTranslation {
    ar?: string;
    bn?: string;
    hi?: string;
    ru?: string;
}

interface ShortNameTranslation {
    ar?: string;
}

interface Team {
    name: string;
    slug: string;
    shortName: string;
    gender: string;
    sport: Sport;
    userCount: number;
    nameCode: string;
    disabled: boolean;
    national: boolean;
    type: number;
    id: number;
    teamColors: TeamColors;
    fieldTranslations: FieldTranslations;
}

interface Promotion {
    text: string;
    id: number;
}

interface Row {
    team: Team;
    descriptions: unknown[];
    promotion?: Promotion;
    position: number;
    matches: number;
    wins: number;
    scoresFor: number;
    scoresAgainst: number;
    id: number;
    losses: number;
    draws: number;
    points: number;
    scoreDiffFormatted: string;
}

interface Standing {
    type: string;
    descriptions: unknown[];
    rows: Row[];
}

interface TeamStatistics {
    goalsScored: number;
    goalsConceded: number;
    ownGoals: number;
    assists: number;
    shots: number;
    penaltyGoals: number;
    penaltiesTaken: number;
    freeKickGoals: number;
    freeKickShots: number;
    goalsFromInsideTheBox: number;
    goalsFromOutsideTheBox: number;
    shotsFromInsideTheBox: number;
    shotsFromOutsideTheBox: number;
    headedGoals: number;
    leftFootGoals: number;
    rightFootGoals: number;
    bigChances: number;
    bigChancesCreated: number;
    bigChancesMissed: number;
    shotsOnTarget: number;
    shotsOffTarget: number;
    blockedScoringAttempt: number;
    successfulDribbles: number;
    dribbleAttempts: number;
    corners: number;
    hitWoodwork: number;
    fastBreaks: number;
    fastBreakGoals: number;
    fastBreakShots: number;
    averageBallPossession: number;
    totalPasses: number;
    accuratePasses: number;
    accuratePassesPercentage: number;
    totalOwnHalfPasses: number;
    accurateOwnHalfPasses: number;
    accurateOwnHalfPassesPercentage: number;
    totalOppositionHalfPasses: number;
    accurateOppositionHalfPasses: number;
    accurateOppositionHalfPassesPercentage: number;
    totalLongBalls: number;
    accurateLongBalls: number;
    accurateLongBallsPercentage: number;
    totalCrosses: number;
    accurateCrosses: number;
    accurateCrossesPercentage: number;
    cleanSheets: number;
    tackles: number;
    interceptions: number;
    saves: number;
    errorsLeadingToGoal: number;
    errorsLeadingToShot: number;
    penaltiesCommited: number;
    penaltyGoalsConceded: number;
    clearances: number;
    clearancesOffLine: number;
    lastManTackles: number;
    totalDuels: number;
    duelsWon: number;
    duelsWonPercentage: number;
    totalGroundDuels: number;
    groundDuelsWon: number;
    groundDuelsWonPercentage: number;
    totalAerialDuels: number;
    aerialDuelsWon: number;
    aerialDuelsWonPercentage: number;
    possessionLost: number;
    offsides: number;
    fouls: number;
    yellowCards: number;
    yellowRedCards: number;
    redCards: number;
    avgRating: number;
    accurateFinalThirdPassesAgainst: number;
    accurateOppositionHalfPassesAgainst: number;
    accurateOwnHalfPassesAgainst: number;
    accuratePassesAgainst: number;
    bigChancesAgainst: number;
    bigChancesCreatedAgainst: number;
    bigChancesMissedAgainst: number;
    clearancesAgainst: number;
    cornersAgainst: number;
    crossesSuccessfulAgainst: number;
    crossesTotalAgainst: number;
    dribbleAttemptsTotalAgainst: number;
    dribbleAttemptsWonAgainst: number;
    errorsLeadingToGoalAgainst: number;
    errorsLeadingToShotAgainst: number;
    hitWoodworkAgainst: number;
    interceptionsAgainst: number;
    keyPassesAgainst: number;
    longBallsSuccessfulAgainst: number;
    longBallsTotalAgainst: number;
    offsidesAgainst: number;
    redCardsAgainst: number;
    shotsAgainst: number;
    shotsBlockedAgainst: number;
    shotsFromInsideTheBoxAgainst: number;
    shotsFromOutsideTheBoxAgainst: number;
    shotsOffTargetAgainst: number;
    shotsOnTargetAgainst: number;
    blockedScoringAttemptAgainst: number;
    tacklesAgainst: number;
    totalFinalThirdPassesAgainst: number;
    oppositionHalfPassesTotalAgainst: number;
    ownHalfPassesTotalAgainst: number;
    totalPassesAgainst: number;
    yellowCardsAgainst: number;
    throwIns: number;
    goalKicks: number;
    ballRecovery: number;
    freeKicks: number;
    id: number;
    matches: number;
    awardedMatches: number;
    statisticsType: StatisticsType;
}

interface StatisticsType {
    sportSlug: string;
    statisticsType: string;
}

interface TeamStanding {
    avgRating: string;
    position: number;
    value: string;
    form: FormSymbol[];
}

type FormSymbol = "W" | "D" | "L";

interface Manager {
    id: number;
    name: string;
    slug: string;
    shortName: string;
    fieldTranslations?: FieldTranslations; // optional
}

interface FieldTranslations {
    nameTranslation?: Translations; // optional
    shortNameTranslation?: Translations; // optional
}

interface TeamLineup {
    players: PlayerInLineup[];
    supportStaff: SupportStaff[];
    formation: string;
    playerColor: JerseyColor;
    goalkeeperColor: JerseyColor;
    missingPlayers: MissingPlayer[];
}

interface PlayerInLineup {
    avgRating: number;
    player: Player;
    teamId: number;
    shirtNumber: number;
    jerseyNumber: string;
    position: string;
    substitute: boolean;
    captain?: boolean;
}

interface Player {
    id: number;
    name: string;
    firstName?: string;
    lastName?: string;
    slug: string;
    shortName: string;
    position: string;
    jerseyNumber: string;
    height?: number;
    userCount: number;
    gender: string;
    sofascoreId?: string; // optional
    country: Country;
    marketValueCurrency?: string;
    dateOfBirthTimestamp?: number;
    proposedMarketValueRaw?: MarketValue;
    fieldTranslations?: FieldTranslations; // optional
}

interface Country {
    alpha2: string;
    alpha3: string;
    name: string;
    slug: string;
}

interface MarketValue {
    value: number;
    currency: string;
}

interface FieldTranslations {
    nameTranslation?: Translations; // optional
    shortNameTranslation?: Translations; // optional
}

interface Translations {
    ar: string;
    bn: string;
    hi: string;
}

interface JerseyColor {
    primary: string;
    number: string;
    outline: string;
    fancyNumber: string;
}

interface MissingPlayer {
    player: Player;
    type: string;
    reason: number;
    description: string;
    externalType: number;
    expectedEndDate: string;
}

interface SupportStaff {
    // Currently empty, extend later if needed
}

interface Duel {
    homeWins: number;
    awayWins: number;
    draws: number;
}

interface FeaturedPlayer {
    player: Player;
    statistics: Statistics;
    eventId: number;
}

interface Statistics {
    rating: number;
}