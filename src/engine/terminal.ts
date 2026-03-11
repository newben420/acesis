import { getDateTime } from "../lib/date_time";
import { Site } from "../site";
import { EventsProcessor } from "./events_processor";
import { ResultEngine } from "./result";
import { SofascoreEngine } from "./sofascore";

export const startEngine = () => new Promise<boolean>(async (resolve, reject) => {
    const loaded = ((await SofascoreEngine.start()) && (await EventsProcessor.start()) && (await ResultEngine.start()));
    resolve(loaded);
});

export const stopEngine = () => new Promise<boolean>(async (resolve, reject) => {
    const conclude = async () => {
        const ended = await Promise.all([
            EventsProcessor.stop(),
            SofascoreEngine.stop(),
            ResultEngine.stop(),
        ]);
        resolve(ended.every(v => v === true));
    }
    conclude();
});