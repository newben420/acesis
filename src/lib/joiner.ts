import axios from "axios";
import { axiosUndici } from "./axios";
import { Booker } from "./../engine/booker";

interface Selection {
  eventId: string | number;
  marketId: string | number;
  outcomeId: string | number;
  [key: string]: any;
}

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

const loadSelections = async (code: string): Promise<Selection[] | null> => {
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
      const { ticket } = data;
      const { selections } = ticket;

      if (Array.isArray(selections) && selections.length > 0) {
        return selections;
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
        const selections = await loadSelections(part);

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

    const res = await Booker.bookSporty(uniqueSelections as any);
    return res ? res.codes : null;
  }

  return codes;
};