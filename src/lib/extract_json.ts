export const extractJsonFromText = (text: string) => {
    const candidates = new Set<any>();

    // Step 1: Try parsing entire input first
    try {
        const parsed = JSON.parse(text.trim());
        if (parsed && typeof parsed === 'object') {
            return parsed;
        }
    } catch {
        // not valid top-level JSON, continue
    }

    // Step 2: Extract from ```json code blocks
    const codeBlockMatches = [...text.matchAll(/```json\s*([\s\S]*?)\s*```/gi)];
    for (const match of codeBlockMatches) {
        candidates.add(match[1]);
    }

    // Step 3: Extract all JSON-like substrings
    const jsonLikeMatches = [...text.matchAll(/({[\s\S]*?})|($begin:math:display$[\\s\\S]*?$end:math:display$)/g)];
    for (const match of jsonLikeMatches) {
        const jsonStr = match[0];
        if (jsonStr && jsonStr.length >= 2) {
            candidates.add(jsonStr);
        }
    }

    // Step 4: Try parsing all candidates, starting with the longest
    const sorted = Array.from(candidates).sort((a, b) => b.length - a.length);
    for (const raw of sorted) {
        try {
            const parsed = JSON.parse(raw.trim());
            if (parsed && typeof parsed === 'object') {
                return parsed;
            }
        } catch {
            // continue trying others
        }
    }

    return null;
}
