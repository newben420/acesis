
interface TeamStats {
    rankings?: ({
        country?: string;
        rankingClass?: string;
        ranking?: number;
        previousRanking?: number;
        points?: number;
        previousPoints?: number;
        bestRanking?: number;
        tournamentsPlayed?: number;
    })[];
    pregame?: {
        form?: ("W" | "D" | "L")[];
    };
    currentYearStats?: {
        matches?: number;
        surface?: string;
        performance?: {
            winRate?: number;
            tournamentWinRate?: number;
        };
        serve?: {
            aceRate?: number
            doubleFaultRate?: number
            firstServeInRate?: number
            firstServeWinRate?: number
            secondServeWinRate?: number
            servicePointsWinRate?: number
        };
        pressure?: {
            breakPointConversion?: number;
            breakPointDefense?: number;
            tiebreakWinRate?: number;
        };
        shotQuality?: {
            winnerErrorRatio?: number;
        }
    };
    currentSeasonStats?: {
        matches?: number;
        surface?: string;
        performance?: {
            winRate?: number
            tournamentWinRate?: number
        };
        serve?: {
            aceRate?: number;
            doubleFaultRate?: number;
            firstServeInRate?: number;
            firstServeWinRate?: number;
            secondServeWinRate?: number;
            servicePointsWinRate?: number;
        };
        pressure?: {
            breakPointConversion?: number;
            breakPointDefense?: number;
            tiebreakWinRate?: number;
        };
        shotQuality?: {
            winnerErrorRatio?: number;
        };
    };
};

export interface Extracted {
    leagueContext?: {
        leagueName?: string;
        season?: string;
    };
    homeTeamStats?: TeamStats;
    awayTeamStats?: TeamStats;
    headToHead?: {
        totalMeetings?: number;
        homeWins?: number;
        awayWins?: number;
        draws?: number;
    };
    platformVotes?: {
        winner?: {
            home?: number;
            away?: number;
            draw?: number;
        }
    };
}
export interface Verdict {
    winner: number,
    reason: string
}