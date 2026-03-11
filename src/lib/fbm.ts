import stringSimilarity from "string-similarity";
import { Match } from './../model/sofascore';

const FLUFF_WORDS = new Set([
     "u21", "u19", "u23", "u20", "youth", "ii", "fc", "sc", "as", "js", "nk", "csc", "acs", "afc", "cd", "rc", "spvgg", "sv", "fk", "bk", "if", "ds", "us", "vv", "kv", "kf", "cs", "reserves", "women", "w", "club", "de", "la", "el", "balompie", "sporting", "real", "city", "town", "united", "cf", "rs", "ac", "ss", "es", "cp", "fs", "ff", "srl", "atp", "wta", "itf"
]);

const ALIASES: Record<string, string> = {
    "utd": "united",
    "man": "manchester",
    "wolves": "wolverhampton",
    "nottm": "nottingham",
    "spurs": "tottenham",
    "mgladbach": "monchengladbach",
    "gladbach": "monchengladbach",
    "psg": "paris",
    "qpr": "queens",
    "bha": "brighton",
    "hove": "brighton",
    "albion": "brighton"
};

const cleanWord = (w: string) => ALIASES[w] || w;

const clean = (s: string) => {
    if (!s) return "";
    let changed = s.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // clear accents
        .replace(/['`"\.\-]/g, " ") // punctuation to spaces
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
        
    const words = changed.split(" ").filter(w => !FLUFF_WORDS.has(w)).map(cleanWord);
    
    // If we stripped everything, fallback to just alpha numeric
    return words.length > 0 ? words.join(" ") : changed.replace(/\s+/g, "");
};

export const calcSimilarity = (target: string, candidate: string) => {
    const t = clean(target);
    const c = clean(candidate);
    
    if (!t || !c) return 0;
    
    // Quick win exact match
    if (t === c) return 1.0;
    
    const squashedT = t.replace(/\s+/g, "");
    const squashedC = c.replace(/\s+/g, "");
    
    if (squashedT === squashedC) return 1.0;
    
    const tWords = t.split(" ");
    const cWords = c.split(" ");
    
    const shorter = tWords.length < cWords.length ? tWords : cWords;
    const longer = tWords.length < cWords.length ? cWords : tWords;
    
    let matches = 0;
    for (const w of shorter) {
        const found = longer.some(lw => {
            // Exact match
            if (w === lw) return true;
            
            // Initial matching: 'l' matches 'luciano', or 'h' matches 'holmgren'
            if ((w.length < 3 || lw.length < 3) && (w.startsWith(lw) || lw.startsWith(w))) {
                return true;
            }
            
            // Lenient matching for longer words
            if (w.length >= 3 && lw.length >= 3) {
                if (w.includes(lw) || lw.includes(w)) return true;
                if (stringSimilarity.compareTwoStrings(w, lw) > 0.8) return true;
            }
            
            return false;
        });
        if (found) matches++;
    }
    
    const wordScore = shorter.length > 0 ? matches / shorter.length : 0;
    const strScore = stringSimilarity.compareTwoStrings(t, c);
    const strSquashedScore = stringSimilarity.compareTwoStrings(squashedT, squashedC);
    
    // Check if one is an exact subset of the other (as a fallback/boost)
    let subsetScore = 0;
    if (squashedT.includes(squashedC) || squashedC.includes(squashedT)) {
        const minLen = Math.min(squashedT.length, squashedC.length);
        const maxLen = Math.max(squashedT.length, squashedC.length);
        if (minLen / maxLen >= 0.35) subsetScore = 0.9;
        else subsetScore = 0.8;
    }
    
    return Math.max(wordScore, strScore, strSquashedScore, subsetScore);
};

export function findBestMatch(home: string, away: string, startTime: number, matches: Match[]): Match | null {
    let bestMatch: { match: Match; score: number } | null = null;
    
    for (const m of matches) {
        // Time filter: Only consider matches within 48 hours to avoid mixing up different fixtures
        const hoursDiff = Math.abs(m.startTime - startTime) / (1000 * 60 * 60);
        if (hoursDiff > 48) continue;

        const homeScore = calcSimilarity(home, m.home);
        const awayScore = calcSimilarity(away, m.away);
        
        let combinedScore = (homeScore + awayScore) / 2;
        
        // Exact / extremely confident matches can short-circuit
        if (combinedScore > 0.95 && hoursDiff < 24) {
            return m;
        }

        if (combinedScore > 0.65) {
            // Apply a minor penalty for time difference
            const timePenalty = (hoursDiff / 48) * 0.1; // Max 0.1 penalty
            combinedScore -= timePenalty;

            if (!bestMatch || combinedScore > bestMatch.score) {
                bestMatch = { match: m, score: combinedScore };
            }
        }
    }

    return bestMatch ? bestMatch.match : null;
}