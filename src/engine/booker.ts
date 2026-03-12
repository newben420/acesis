import { axiosUndici } from './../lib/axios';
import axios, { AxiosError } from "axios";
import { EventsProcessor } from "./events_processor";
import { LoadSelectionsResponse } from 'src/model/result';

type Selection = {
  eventId: string;
  specifier: string | null;
  marketId: string;
  outcomeId: string;
  [key: string]: any;
};

type BookOk = { ok: true; shareCode: string; raw?: any };

type BookFail = {
  ok: false;
  bizCode?: number;
  isAvailable?: boolean;
  message?: string;
  raw?: any;
  kind: "unavailable" | "transient" | "unknown";
};

interface Ticket {
  selections: Selection[];
}

interface ShareData {
  shareCode: string;
  shareURL: string;
  ticket: Ticket;
  deadline: number;
  outcomes: any[];
}

interface ShareResponse {
  bizCode?: number;
  isAvailable?: boolean;
  message?: string;
  data?: ShareData;
}

export const loadSelections = async (code: string, bodyOnly: boolean = false): Promise<any> => {
  try {
    const r = await axiosUndici.get<ShareResponse>(
      `https://www.sportybet.com/api/ng/orders/share/${code}`,
      {
        headers: {
          "user-agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        },
        timeout: 30000,
      }
    );

    const body = r.data;
    const { isAvailable, message, data } = body;

    if (isAvailable && (message || "").toLowerCase() === "success" && data) {
      let selections = data.ticket?.selections;
      if (selections && !Array.isArray(selections) && (selections as any).selections) {
        selections = (selections as any).selections;
      }

      let outcomes = data.outcomes;
      if (outcomes && !Array.isArray(outcomes) && (outcomes as any).outcomes) {
        outcomes = (outcomes as any).outcomes;
      }

      if (Array.isArray(selections) && selections.length > 0) {
        if (bodyOnly) {
          if (Array.isArray(outcomes)) {
            // Normalize body for consumer (result.ts)
            const normalized = JSON.parse(JSON.stringify(body));
            normalized.data.ticket.selections = selections;
            normalized.data.outcomes = outcomes;
            return normalized as unknown as LoadSelectionsResponse;
          }
          return null;
        }
        return selections as unknown as Selection[];
      }
    }

    return null;
  } catch (error) {
    console.error(error);
    return null;
  }
};

/**
 * Join multiple SportyBet share codes silently
 */
export const silentCodesJoiner = async (
  codes: string | null
): Promise<string | null> => {
  if (!codes) return null;

  const parts = codes.split(/[\s,]+/).filter(Boolean);

  if (parts.length > 1) {
    let totalSelections: Selection[] = [];
    let totalIntended = 0;
    let foundCodes = 0;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (/^[A-Z0-9]{5,6}$/i.test(part)) {
        const selections: Selection[] = await loadSelections(part);

        if (selections) {
          totalSelections = totalSelections.concat(selections);
          foundCodes++;

          if (i + 1 < parts.length && /^\d+\/\d+$/.test(parts[i + 1])) {
            const ratio = parts[i + 1];
            totalIntended += parseInt(ratio.split("/")[1]);
            i++;
          } else {
            totalIntended += selections.length;
          }
        }
      }
    }

    if (foundCodes === 0) return codes;

    if (totalIntended === 0) {
      totalIntended = totalSelections.length;
    }

    const seen = new Set<string>();
    const uniqueSelections: Selection[] = [];

    for (const s of totalSelections) {
      const key = `${s.eventId}:${s.marketId}:${s.outcomeId}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueSelections.push(s);
      }
    }

    if (foundCodes === 1 && parts.length <= 2) {
      return codes;
    }

    return await Booker.bookSporty(uniqueSelections);
  }

  return codes;
};

type BookAttempt = BookOk | BookFail;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (base: number, spread = 80) => base + Math.floor(Math.random() * spread);

const selectionKey = (s: Selection) =>
  `${s.eventId}:${s.marketId}:${s.outcomeId}:${s.specifier ?? ""}`;

export class Booker {
  // -------------------------
  // Rate-limit friendly tuning
  // -------------------------
  private static readonly WAIT_PER_CALL_MS = 140; // small wait before each API call
  private static readonly WAIT_BEFORE_SPLIT_MS = 220; // small wait before deeper recursion split
  private static readonly RETRY_WAIT_MS = 450; // small wait before retrying a transient failure
  private static readonly MAX_RETRIES = 2; // retry count for transient/unknown failures
  private static readonly MAX_DEPTH = 32; // recursion safety
  private static readonly MIN_CHUNK = 1; // isolate down to singles

  // Memo: avoid re-testing singles we already proved are dead.
  private static badSingles = new Set<string>();

  // Memo: avoid re-hitting identical failing chunks (helps when you call bookDC multiple times).
  private static failedChunks = new Set<string>();

  // ---------------------------------------
  // Your existing Sporty request parameters
  // ---------------------------------------
  private static readonly sportyUrl = `https://www.sportybet.com/api/ng/orders/share`;

  private static readonly sportyHeaders = {
    accept: `*/*`,
    "accept-language": `en`,
    clientid: `web`,
    "content-type": `application/json;charset=UTF-8`,
    platform: `web`,
    priority: `u=1, i`,
    referer: `https://www.sportybet.com/ng/`,
    origin: `https://www.sportybet.com`,
    "sec-ch-ua": `"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"`,
    "sec-ch-ua-mobile": `?0`,
    "sec-ch-ua-platform": `"Linux"`,
    "sec-fetch-dest": `empty`,
    "sec-fetch-mode": `same-origin`,
    "sec-fetch-site": `same-origin`,
    "sporty-referer": `utm_source=https://www.google.com/`,
    "user-agent": `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36`,
  };

  // -----------------------------
  // Helper: classify failure type
  // -----------------------------
  private static classifyFailure(body: any, error?: any): BookFail["kind"] {
    const bizCode = body?.bizCode;
    const msg = String(body?.message ?? "").toLowerCase();

    // Your known case
    if (bizCode === 10098) return "unavailable";

    // Common “hard unavailable” responses
    if (
      msg.includes("not available") ||
      msg.includes("unavailable") ||
      msg.includes("share code") ||
      msg.includes("invalid selection") ||
      (msg.includes("selection") && msg.includes("not") && msg.includes("available"))
    ) {
      return "unavailable";
    }

    // If API explicitly says unavailable
    if (body && body.isAvailable === false) return "unavailable";

    // Network/timeout/429/5xx: transient
    if (error) {
      const ae = error as AxiosError;
      const status = ae.response?.status;
      const code = (ae as any)?.code;

      if (code === "ECONNABORTED") return "transient";
      if (status === 429) return "transient";
      if (status && status >= 500) return "transient";
    }

    return "unknown";
  }

  // -----------------------------------------
  // Low-level call: returns structured attempt
  // -----------------------------------------
  private static async bookSportyAttempt(selections: Selection[]): Promise<BookAttempt> {
    // gentle pacing to be kind to rate limits
    await sleep(jitter(Booker.WAIT_PER_CALL_MS));

    try {
      const r = await axiosUndici.post(
        Booker.sportyUrl,
        { selections },
        { headers: Booker.sportyHeaders, timeout: 30000 }
      );

      const body = r.data ?? {};
      const { isAvailable, message, data, bizCode } = body;

      const shareCode = data?.shareCode;
      if (isAvailable && String(message || "").toLowerCase() === "success" && shareCode) {
        return { ok: true, shareCode, raw: body };
      }

      return {
        ok: false,
        bizCode,
        isAvailable,
        message,
        raw: body,
        kind: Booker.classifyFailure(body),
      };
    } catch (err: any) {
      const body = err?.response?.data;
      return {
        ok: false,
        bizCode: body?.bizCode,
        isAvailable: body?.isAvailable,
        message: body?.message ?? err?.message ?? "request_failed",
        raw: body,
        kind: Booker.classifyFailure(body, err),
      };
    }
  }

  // ---------------------------------------------
  // Retry wrapper: only retries transient/unknown
  // ---------------------------------------------
  private static async bookSportyWithRetry(selections: Selection[]): Promise<BookAttempt> {
    // If single is known bad, skip wasting calls
    if (selections.length === 1) {
      const k = selectionKey(selections[0]);
      if (Booker.badSingles.has(k)) {
        return { ok: false, kind: "unavailable", message: "known_bad_single" };
      }
    }

    let last: BookAttempt = { ok: false, kind: "unknown", message: "init" };

    for (let attempt = 0; attempt <= Booker.MAX_RETRIES; attempt++) {
      last = await Booker.bookSportyAttempt(selections);

      if (last.ok) return last;

      // hard unavailable => don't retry
      if (!last.ok && last.kind === "unavailable") return last;

      // transient/unknown => tiny retry
      if (attempt < Booker.MAX_RETRIES) {
        await sleep(jitter(Booker.RETRY_WAIT_MS, 120));
      }
    }

    return last;
  }

  // ---------------------------
  // Chunk key for memoization
  // ---------------------------
  private static chunkKey(selections: Selection[]): string {
    // keep stable ordering
    return selections.map(selectionKey).join("|");
  }

  // -------------------------------------------------------
  // MAIN: divide-and-conquer booking
  // returns: { codes: [], bad: [] }
  // -------------------------------------------------------
  private static async bookByBisection(
    selections: Selection[],
    depth = 0
  ): Promise<{ codes: string[]; bad: Selection[] }> {
    if (!selections.length) return { codes: [], bad: [] };
    if (depth > Booker.MAX_DEPTH) return { codes: [], bad: selections };

    // Fast-path for known-bad single
    if (selections.length === 1) {
      const k = selectionKey(selections[0]);
      if (Booker.badSingles.has(k)) return { codes: [], bad: selections };
    }

    // If we've already seen this exact chunk fail before, split immediately
    const ck = Booker.chunkKey(selections);
    if (selections.length > 1 && Booker.failedChunks.has(ck)) {
      return Booker.splitAndRecurse(selections, depth);
    }

    // Try booking the whole chunk
    const res = await Booker.bookSportyWithRetry(selections);

    if (res.ok) return { codes: [res.shareCode], bad: [] };

    // Memo this failing chunk so future calls split immediately
    Booker.failedChunks.add(ck);

    // If we are at minimum chunk, it’s a dead selection
    if (selections.length <= Booker.MIN_CHUNK) {
      if (selections[0]) Booker.badSingles.add(selectionKey(selections[0]));
      return { codes: [], bad: selections };
    }

    // Otherwise split
    return Booker.splitAndRecurse(selections, depth);
  }

  private static async splitAndRecurse(
    selections: Selection[],
    depth: number
  ): Promise<{ codes: string[]; bad: Selection[] }> {
    await sleep(jitter(Booker.WAIT_BEFORE_SPLIT_MS, 90));

    const mid = Math.ceil(selections.length / 2);
    const left = selections.slice(0, mid);
    const right = selections.slice(mid);

    const a = await Booker.bookByBisection(left, depth + 1);
    const b = await Booker.bookByBisection(right, depth + 1);

    return { codes: [...a.codes, ...b.codes], bad: [...a.bad, ...b.bad] };
  }

  // -------------------------------------------------------------------
  // DROP-IN FUNCTION: same signature as your old bookSporty
  // This now returns share codes separated by space if chunking happened.
  // -------------------------------------------------------------------
  static bookSporty = async (selections: any[]): Promise<string | null> => {
    const typed = (selections as Selection[]) ?? [];
    if (!typed.length) return null;

    const { codes } = await Booker.bookByBisection(typed);

    if (!codes.length) return null;
    return codes.join(" ");
  };

  static bookWinner = async (opts?: {
    limit?: number;
    offset?: number;
    minScore?: number;
    minOdds?: number;
    maxOdds?: number;
    strict?: boolean;
    superStrict?: boolean;
  }): Promise<string> => {
    const limit = opts?.limit ?? 20;
    const offset = opts?.offset ?? 0;
    const minScore = opts?.minScore ?? 0;
    const minOdds = opts?.minOdds ?? 1;
    const maxOdds = opts?.maxOdds ?? 0;
    const strict = opts?.strict ?? false;
    const superStrict = opts?.superStrict ?? false;

    // Tennis Winner Market IDs (Updated)
    const MARKET_ID_WINNER = "186";
    const OUTCOME_ID_HOME = "4";
    const OUTCOME_ID_AWAY = "5";
    const SPORT_ID = "sr:sport:5";

    try {
      let matches = EventsProcessor.getUpcomingFixtures().filter(
        (e) =>
          (e.score || 0) >= minScore && !e.isTurnedOff
      );

      if (!matches.length) return "No matches available.";

      // Sort by Edge
      matches = matches.sort((a, b) => ((b.score || 0) - (a.score || 0)));

      matches = matches.slice(offset, offset + limit);

      const selections = matches.map((m) => {
        let outcomeId: string | null = null;

        if (superStrict) {
          if (m.llmWinner === 1) outcomeId = OUTCOME_ID_HOME;
          else if (m.llmWinner === 2) outcomeId = OUTCOME_ID_AWAY;
          else return null;
        } else {
          const statsHomeFav = (m.homeScore || 0) >= (m.awayScore || 0);
          const predOdds = statsHomeFav ? (m.odds.homeWin ?? 0) : (m.odds.awayWin ?? 0);

          // Odds Filter
          if (predOdds < minOdds) return null;
          if (maxOdds > 0 && predOdds > maxOdds) return null;

          outcomeId = statsHomeFav ? OUTCOME_ID_HOME : OUTCOME_ID_AWAY;

          if (strict) {
            // In strict mode, llmWinner must match the pick
            if (statsHomeFav && m.llmWinner !== 1) return null;
            if (!statsHomeFav && m.llmWinner !== 2) return null;
          }
        }

        return {
          eventId: m.eventId,
          specifier: null,
          marketId: MARKET_ID_WINNER,
          outcomeId,
          sportId: SPORT_ID
        };
      }).filter(Boolean) as Selection[];

      if (!selections.length) return "No matches met strict criteria.";

      const codes = await Booker.bookSporty(selections);
      return codes || "Could not book selections.";
    } catch (error) {
      return (error as any).message || "An unknown exception was encountered.";
    }
  };
}
