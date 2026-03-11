import { axiosUndici } from './../lib/axios';
import { Site } from './../site';
import { ResultsResponse, UpcomingResponse } from './../model/sporty';
import { Log } from './../lib/log';
import axios from "axios";

export class SportyHelpers {

    private static API_BASE = `https://www.sportybet.com`;

    private static TIMEOUT = 30000;

    private static fetchUpcomingPage = async (
        pageNum: number,
        startTime: number,
    ) => {
        const sportId = "sr:sport:5";
        // const marketId = "186,189,202,188,187";
        const marketId = "186";
        const pageSize = `100`;
        const option = `1`;
        const timeline = `${Site.WAIT_HOURS}`;
        const _t = startTime.toString();

        const qs = new URLSearchParams({
            sportId,
            marketId,
            pageSize,
            pageNum: pageNum.toString(),
            option,
            timeline,
            _t,
        });

        try {
            const url = `${SportyHelpers.API_BASE}/api/ng/factsCenter/pcUpcomingEvents?${qs.toString()}`;
            const res: UpcomingResponse = (await axiosUndici.get(url, {
                timeout: SportyHelpers.TIMEOUT,
                headers: { ...SportyHelpers.getGenericHeaders() },
            })).data;
            return res;
        } catch (error) {
            Log.dev(error);
            return null;
        }
    };

    static getUpcoming = async (
        startTime: number = Date.now(),
    ) => {
        let allEvents: any[] = [];
        let currentPage = 1;
        let totalNum = 0;
        let fetchedCount = 0;

        Log.flow(["SPORTY", `Fetch Upcoming`, `Starting sequence.`], 3);

        do {
            Log.flow(["SPORTY", `Fetch Upcoming`, `Fetching page ${currentPage}.`], 3);
            const res = await SportyHelpers.fetchUpcomingPage(currentPage, startTime);
            if (!res || !res.data) {
                Log.flow(["SPORTY", `Fetch Upcoming`, `Page ${currentPage} returned empty or null.`], 3);
                break;
            }

            if (res.data.totalNum) {
                totalNum = res.data.totalNum;
            }

            if (res.data.tournaments && Array.isArray(res.data.tournaments) && res.data.tournaments.length > 0) {
                const events = res.data.tournaments.map(tour => tour.events).flat();
                allEvents = allEvents.concat(events);
                fetchedCount += events.length;
                Log.flow(["SPORTY", `Fetch Upcoming`, `Fetched ${events.length} events from page ${currentPage}. Total so far: ${fetchedCount}/${totalNum}.`], 3);
            } else {
                Log.flow(["SPORTY", `Fetch Upcoming`, `No tournaments found on page ${currentPage}.`], 3);
                break;
            }

            if (fetchedCount > 0 && fetchedCount >= totalNum) {
                break;
            }

            currentPage++;
        } while (fetchedCount < totalNum && totalNum > 0);

        Log.flow(["SPORTY", `Fetch Upcoming`, `Sequence concluded. Total events fetched: ${allEvents.length}.`], 3);

        if (allEvents.length > 0) {
            return allEvents;
        }

        return null;
    };

    private static getGenericHeaders = () => {
        return {
            "accept": "*/*",
            "accept-language": "en",
            "clientid": "web",
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",

            "operid": "2",
            "platform": "web",

            "referer": "https://www.sportybet.com/ng/sport/football?time="+Site.WAIT_HOURS,

            "user-agent":
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",

            // Cookies only if endpoint needs session context
            "cookie":
                "locale=en; sb_country=ng"
        };
    };

    private static getGenericHeaders2 = () => {
        return {
            "accept": "*/*",
            "accept-language": "en",
            "clientid": "web",
            "content-type": "application/json;charset=UTF-8",

            "operid": "2",
            "platform": "web",

            "referer": "https://www.sportybet.com/ng/liveResult",

            "user-agent":
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",

            // Cookies only if endpoint needs session context
            "cookie":
                "locale=en; sb_country=ng"
        };
    };

    private static getGenericHeaders3 = () => {
        return {
            "content-type": "application/json;charset=UTF-8",
        };
    };

    static getResult = async (
        gameId: string,
        startTime: number = Date.now(),
    ) => {
        const pageSize = `5`;
        const pageNum = `1`;
        const _t = startTime.toString();

        const qs = new URLSearchParams({
            pageSize,
            pageNum,
            gameId,
            _t,
        });

        try {
            const url = `${SportyHelpers.API_BASE}/api/ng/factsCenter/eventResultList?${qs.toString()}`;
            const res: ResultsResponse = (await axiosUndici.get(url, {
                timeout: SportyHelpers.TIMEOUT,
                headers: { ...SportyHelpers.getGenericHeaders2() },
            })).data;
            if (res.data && res.data.totalNum && res.data.totalNum > 0 && res.data.tournaments && Array.isArray(res.data.tournaments) && res.data.tournaments.length > 0) {
                const events = res.data.tournaments.map(tour => tour.events).flat();
                if (events.length > 0) {
                    return events;
                }
            }

            return null;
        } catch (error) {
            Log.dev(error);
            return null;
        }
    };

}