import { Odds } from './../model/sporty';
import { Site } from './../site';
import { Extracted, Verdict } from './../model/prompt';
import { GroqEngine } from "./groq";
import { impliedProbability } from './../lib/sportylib';

export class PromptEngine {

    // ===============================
    // SYSTEM PROMPT
    // ===============================

    private static verdictSystemPrompt = () => {
        return [
            `ACT AS: Senior Tennis Match Analyst and Quantitative Sports Researcher.`,

            `GOAL: Evaluate a tennis match and determine if one player has a CLEAR statistical edge to win.`,

            `IMPORTANT:`,

            `- You are NOT predicting draws. Tennis matches must produce a winner.`,
            `- However, if the statistical evidence does not show a strong edge, you must return winner: 0.`,
            `- winner: 1 means the HOME player has a clear edge.`,
            `- winner: 2 means the AWAY player has a clear edge.`,
            `- winner: 0 means the match is too balanced or uncertain.`,

            ``,
            `CORE ANALYSIS PILLARS:`,

            `1. Ranking Strength`,
            `   - Compare player rankings and historical ranking peaks.`,
            `   - Large ranking gaps strongly favor the better ranked player.`,

            `2. Recent Form`,
            `   - Evaluate W/L form patterns.`,
            `   - Winning streaks often indicate momentum and match sharpness.`,

            `3. Serve Dominance`,
            `   - Compare firstServeWinRate, secondServeWinRate and servicePointsWinRate.`,
            `   - In modern tennis, serve efficiency is the strongest predictor of match success.`,

            `4. Pressure Performance`,
            `   - Analyze breakPointConversion, breakPointDefense and tiebreakWinRate.`,
            `   - Players who perform well under pressure often outperform expectations.`,

            `5. Shot Discipline`,
            `   - Use winnerErrorRatio to determine aggressive but controlled play.`,
            `   - A higher ratio suggests superior shot-making ability.`,

            `6. Head-to-Head Psychology`,
            `   - Evaluate historical wins between the two players.`,
            `   - Some players match up better stylistically.`,

            `7. Market Signals`,
            `   - Odds can reveal collective market expectations.`,
            `   - Large odds gaps may confirm statistical dominance.`,

            ``,
            `DECISION RULES:`,

            `- Choose winner: 1 or winner: 2 ONLY if multiple pillars align clearly.`,
            `- If both players look competitive or data is inconclusive, return winner: 0.`,
            `- Refrain from making a decision (return winner: 0) if the statistical data is heavily one-sided or insufficient for a fair comparison (e.g., pregame form is available for only one player and missing for the other).`,
            `- Be conservative: avoid guessing when edge is weak.`,

            ``,
            `OUTPUT FORMAT (STRICT JSON ONLY):`,
            `{"winner": number, "reason": "string"}`,

            ``,
            `REASONING RULES:`,

            `- Use professional tennis terminology. Max 2 sentences or 50 words.`,
            `- Explain the strongest statistical signals first.`,
            `- Be concise but analytical.`,
            `- Do NOT include any text outside the JSON.`,
        ].join("\n");
    }

    // ===============================
    // USER PROMPT
    // ===============================

    private static verdictPrompt = (
        home: string,
        away: string,
        league: string,
        startTime: number,
        odds: Odds,
        extracted: Extracted
    ) => {

        const system = PromptEngine.verdictSystemPrompt();

        const homeProb = impliedProbability(odds.homeWin);
        const awayProb = impliedProbability(odds.awayWin);

        const user = [

            `### FIXTURE INFORMATION ###`,
            `Match: ${home} vs ${away}`,
            `Tournament: ${league}`,
            `Start Time: ${new Date(startTime).toISOString()}`,

            ``,
            `### MARKET ODDS ###`,
            `Home Win Odds: ${odds.homeWin ?? "N/A"}`,
            `Away Win Odds: ${odds.awayWin ?? "N/A"}`,

            `Market Implied Probabilities:`,
            `Home: ${homeProb ? homeProb.toFixed(4) : "N/A"}`,
            `Away: ${awayProb ? awayProb.toFixed(4) : "N/A"}`,

            ``,
            `### EXTRACTED MATCH DATA ###`,
            `${JSON.stringify(extracted, null, 2)}`,

            ``,
            `Analyze the statistics carefully using the CORE ANALYSIS PILLARS and determine if either player has a clear edge.`,

            `Return winner:`,
            `1 = Home player`,
            `2 = Away player`,
            `0 = No clear edge`,

        ].join("\n");

        return { system, user };
    }

    // ===============================
    // EXECUTION
    // ===============================

    static verdict = async (
        home: string,
        away: string,
        league: string,
        startTime: number,
        opts: {
            odds: Odds,
            extracted: Extracted,
        }
    ): Promise<Verdict | null> => {

        const { system, user } =
            PromptEngine.verdictPrompt(
                home,
                away,
                league,
                startTime,
                opts.odds,
                opts.extracted
            );

        const res = await GroqEngine.direct({
            messages: [
                {
                    role: 'system',
                    content: system,
                },
                {
                    role: 'user',
                    content: user,
                }
            ],
            preferredModels: [
                "moonshotai/kimi-k2-instruct-0905",
                "openai/gpt-oss-120b",
                "openai/gpt-oss-20b",
            ]
        });

        if (res.succ) {

            let verdict: Verdict =
                GroqEngine.extractJSONResponse(res.message);

            return verdict;
        }

        return null;
    }
}