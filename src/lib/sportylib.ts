import { Extracted } from './../model/prompt';

// ===============================
// Helpers
// ===============================

export function impliedProbability(odd?: number): number {
    if (!odd || odd <= 1) return 0
    return 1 / odd
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));

const safe = (v?: number | null, fallback = 0) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;

const mean = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

const toRatio = (v?: number) =>
    typeof v === "number" && Number.isFinite(v) ? clamp(v) : null;

// ===============================
// Feature Extractors
// ===============================

function rankingStrength(rank?: number) {

    if (!rank) return null;

    const MAX_RANK = 500;

    return clamp(1 - rank / MAX_RANK);
}

function serveStrength(serve?: any) {

    if (!serve) return null;

    const vals = [
        toRatio(serve.firstServeWinRate),
        toRatio(serve.secondServeWinRate),
        toRatio(serve.servicePointsWinRate),
        toRatio(serve.firstServeInRate)
    ].filter(v => v !== null) as number[];

    if (!vals.length) return null;

    return mean(vals);
}

function pressureStrength(pressure?: any) {

    if (!pressure) return null;

    const vals = [
        toRatio(pressure.breakPointConversion),
        toRatio(pressure.breakPointDefense),
        toRatio(pressure.tiebreakWinRate)
    ].filter(v => v !== null) as number[];

    if (!vals.length) return null;

    return mean(vals);
}

function shotStrength(shot?: any) {

    if (!shot?.winnerErrorRatio) return null;

    return clamp(shot.winnerErrorRatio / 3);
}

function formStrength(form?: ("W" | "D" | "L")[]) {

    if (!form || !form.length) return null;

    const wins =
        form.filter(x => x === "W").length;

    return wins / form.length;
}

// ===============================
// Team Strength Builder
// ===============================

function buildTeamStrength(team?: any) {

    const contributions: Record<string, number> = {};

    let score = 0;
    let weight = 0;

    // ===============================
    // RANKING (25%)
    // ===============================

    const rank =
        team?.rankings?.[0]?.ranking;

    const rankScore =
        rankingStrength(rank);

    if (rankScore !== null) {

        contributions.ranking =
            rankScore * 0.25;

        score += contributions.ranking;
        weight += 0.25;
    }

    // ===============================
    // RECENT FORM (15%)
    // ===============================

    const form =
        formStrength(team?.pregame?.form);

    if (form !== null) {

        contributions.form =
            form * 0.15;

        score += contributions.form;
        weight += 0.15;
    }

    // ===============================
    // SERVE STRENGTH (35%)
    // ===============================

    const serve =
        serveStrength(
            team?.currentYearStats?.serve ??
            team?.currentSeasonStats?.serve
        );

    if (serve !== null) {

        contributions.serve =
            serve * 0.35;

        score += contributions.serve;
        weight += 0.35;
    }

    // ===============================
    // PRESSURE PLAY (12%)
    // ===============================

    const pressure =
        pressureStrength(
            team?.currentYearStats?.pressure ??
            team?.currentSeasonStats?.pressure
        );

    if (pressure !== null) {

        contributions.pressure =
            pressure * 0.12;

        score += contributions.pressure;
        weight += 0.12;
    }

    // ===============================
    // SHOT DISCIPLINE (8%)
    // ===============================

    const shot =
        shotStrength(
            team?.currentYearStats?.shotQuality ??
            team?.currentSeasonStats?.shotQuality
        );

    if (shot !== null) {

        contributions.shotQuality =
            shot * 0.08;

        score += contributions.shotQuality;
        weight += 0.08;
    }

    const finalScore =
        weight > 0
            ? score / weight
            : 0.5;

    return {
        score: clamp(finalScore),
        contributions
    };
}

// ===============================
// Winner Engine
// ===============================

export function tennisWinnerScore(
    fixture: Extracted
) {

    const home =
        buildTeamStrength(
            fixture.homeTeamStats
        );

    const away =
        buildTeamStrength(
            fixture.awayTeamStats
        );

    let homeScore = home.score;
    let awayScore = away.score;

    // ===============================
    // HEAD TO HEAD (3%)
    // ===============================

    const h2h =
        fixture.headToHead;

    if (
        h2h?.totalMeetings &&
        h2h.homeWins !== undefined &&
        h2h.awayWins !== undefined
    ) {

        const total =
            h2h.homeWins +
            h2h.awayWins;

        if (total > 0) {

            const h2hHome =
                h2h.homeWins / total;

            const h2hAway =
                h2h.awayWins / total;

            homeScore += h2hHome * 0.03;
            awayScore += h2hAway * 0.03;
        }
    }

    // ===============================
    // PLATFORM VOTES (2%)
    // ===============================

    const vote =
        fixture.platformVotes?.winner;

    if (vote) {

        const homeVotes = safe(vote.home);
        const awayVotes = safe(vote.away);
        const drawVotes = safe(vote.draw);

        const total =
            homeVotes + awayVotes + drawVotes;

        if (total > 0) {

            const homeBias =
                homeVotes / total;

            const awayBias =
                awayVotes / total;

            homeScore += homeBias * 0.02;
            awayScore += awayBias * 0.02;
        }
    }

    // ===============================
    // FINAL NORMALIZATION
    // ===============================

    homeScore = clamp(homeScore);
    awayScore = clamp(awayScore);

    const total =
        homeScore + awayScore || 1;

    const homeWinScore =
        homeScore / total;

    const awayWinScore =
        awayScore / total;

    const edge =
        Math.abs(homeWinScore - awayWinScore);

    return {

        homeWinScore,
        awayWinScore,

        edge,

        raw: {
            homeStrength: home.score,
            awayStrength: away.score
        },

        contributions: {
            home: home.contributions,
            away: away.contributions
        }
    };
}