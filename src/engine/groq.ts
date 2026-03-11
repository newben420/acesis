import { GRes, Res } from "../lib/res";
import { Site } from "../site";
import Groq from 'groq-sdk';
import { Log } from "../lib/log";
import { UUIDHelper } from "../lib/uuid";
import { extractJsonFromText } from "./../lib/extract_json";

const SLUG = "Groq";

type ModelName =
    "allam-2-7b"
    | "groq/compound"
    | "groq/compound-mini"
    | "llama-3.1-8b-instant"
    | "llama-3.3-70b-versatile"
    | "llama3-70b-8192"
    | "llama3-8b-8192"
    | "meta-llama/llama-4-maverick-17b-128e-instruct"
    | "meta-llama/llama-4-scout-17b-16e-instruct"
    | "meta-llama/llama-guard-4-12b"
    | "meta-llama/llama-prompt-guard-2-22m"
    | "meta-llama/llama-prompt-guard-2-86m"
    | "mistral-saba-24b"
    | "qwen-qwq-32b"
    | "qwen/qwen3-32b"
    | "moonshotai/kimi-k2-instruct"
    | "moonshotai/kimi-k2-instruct-0905"
    | "openai/gpt-oss-120b"
    | "openai/gpt-oss-20b";

interface Model {
    RPM: number;
    RPD: number;
    TPM?: number;
    TPD?: number;
}

const models: Record<ModelName, Model> = {
    "allam-2-7b": { RPM: 30, RPD: 7000, TPM: 6000, TPD: 500000 },
    "groq/compound": { RPM: 30, RPD: 250, TPM: 70000 },
    "groq/compound-mini": { RPM: 30, RPD: 250, TPM: 70000 },
    "llama-3.1-8b-instant": { RPM: 30, RPD: 14400, TPM: 6000, TPD: 500000 },
    "llama-3.3-70b-versatile": { RPM: 30, RPD: 1000, TPM: 12000, TPD: 100000 },
    "llama3-70b-8192": { RPM: 30, RPD: 14400, TPM: 6000, TPD: 500000 },
    "llama3-8b-8192": { RPM: 30, RPD: 14400, TPM: 6000, TPD: 500000 },
    "meta-llama/llama-4-maverick-17b-128e-instruct": { RPM: 30, RPD: 1000, TPM: 6000 },
    "meta-llama/llama-4-scout-17b-16e-instruct": { RPM: 30, RPD: 1000, TPM: 30000 },
    "meta-llama/llama-guard-4-12b": { RPM: 30, RPD: 14400, TPM: 15000 },
    "meta-llama/llama-prompt-guard-2-22m": { RPM: 30, RPD: 14400, TPM: 15000 },
    "meta-llama/llama-prompt-guard-2-86m": { RPM: 30, RPD: 14400, TPM: 15000 },
    "mistral-saba-24b": { RPM: 30, RPD: 1000, TPM: 6000, TPD: 500000 },
    "qwen-qwq-32b": { RPM: 30, RPD: 1000, TPM: 6000 },
    "qwen/qwen3-32b": { RPM: 60, RPD: 1000, TPM: 6000 },
    "moonshotai/kimi-k2-instruct": {RPM: 60, RPD: 1000, TPM: 10000, TPD: 300000},
    "moonshotai/kimi-k2-instruct-0905": {RPM: 60, RPD: 1000, TPM: 10000, TPD: 300000},
    "openai/gpt-oss-20b": {RPM: 30, RPD: 1000, TPM: 8000, TPD: 200000},
    "openai/gpt-oss-120b": {RPM: 30, RPD: 1000, TPM: 8000, TPD: 200000},
};

class ActiveModel {
    name!: ModelName;
    useMin!: number;
    currMin!: number;
    useDay!: number;
    currDay!: number;
    useMinTok!: number;
    useDayTok!: number;
}

interface ComplexContent {
    type: "text" | "image_url";
    text?: string;
    image_url?: { url: string };
}

interface Message {
    role: "user" | "system" | "assistant"/* | ModelName*/;
    content: string | (ComplexContent[]);
}

type ReqCB = (r: Res) => void;

interface Request {
    messages: Message[];
    preferredModels?: ModelName[];
    priority?: number;
    callback: ReqCB;
}

interface InstRequest extends Request {
    timeout: NodeJS.Timeout | null;
    preferredModels: ModelName[];
    id: string;
    completed?: boolean;
    priority: number;
}

export class GroqEngine {
    private static activeModels: ActiveModel[] = (Site.GROQ_MODELS.filter(
        x => Object.keys(models).includes(x)
    ) as ModelName[]).map(name => ({
        name,
        currMin: Date.now(),
        currDay: Date.now(),
        useDay: 0,
        useMin: 0,
        useDayTok: 0,
        useMinTok: 0,
    }));

    private static queue: InstRequest[] = [];
    private static isRunning = false;

    private static client = new Groq({
        apiKey: Site.GROQ_KEY,
        maxRetries: Site.GROQ_MAX_RETRIES,
        timeout: Site.GROQ_HTTP_TIMEOUT_MS,
    });

    static request = (req: Request) => {
        const id = UUIDHelper.generate();
        const instReq: InstRequest = {
            messages: req.messages,
            callback: req.callback,
            timeout:
                Site.GROQ_REQUEST_TIMEOUT_MS < Infinity
                    ? setTimeout(() => {
                        const i = GroqEngine.queue.findIndex(x => x.id === id);
                        if (i >= 0) {
                            if (!GroqEngine.queue[i].completed) {
                                GroqEngine.queue[i].callback(GRes.err("API.AI_TIMEOUT", { tr: true }));
                            }
                            GroqEngine.queue[i].callback = (r) => { };
                            GroqEngine.queue[i].completed = true;
                            GroqEngine.queue.splice(i, 1);
                        }
                    }, Site.GROQ_REQUEST_TIMEOUT_MS)
                    : null,
            preferredModels: req.preferredModels || [],
            id,
            priority: req.priority ?? Number.MAX_SAFE_INTEGER,
        };
        let index = GroqEngine.queue.findIndex(x => x.priority > instReq.priority);
        if (index < 0) {
            GroqEngine.queue.push(instReq);
        }
        else {
            GroqEngine.queue.splice(index, 0, instReq);
        }
        GroqEngine.run();
    };

    static direct = (request: Omit<Request, 'callback'>) => new Promise<Res>((resolve, reject) => {
        GroqEngine.request({
            ...request,
            callback(r){
                resolve(r);
            }
        })
    })

    private static run = async () => {
        if (GroqEngine.isRunning) return;
        GroqEngine.isRunning = true;
        let backoff = 200;
        let noModelAvailable = false;
        while (GroqEngine.queue.length > 0) {
            let processedOne = false;

            for (let i = 0; i < GroqEngine.queue.length; i++) {
                const req = GroqEngine.queue[i];
                const now = Date.now();

                const candidates = (req.preferredModels.length > 0
                    ? GroqEngine.activeModels.filter(m =>
                        req.preferredModels.includes(m.name)
                    )
                    : GroqEngine.activeModels
                ).filter(m => {
                    const def = models[m.name];

                    if (now - m.currMin >= 60_000) {
                        m.currMin = now;
                        m.useMin = 0;
                        m.useMinTok = 0;
                    }

                    if (now - m.currDay >= 86_400_000) {
                        m.currDay = now;
                        m.useDay = 0;
                        m.useDayTok = 0;
                    }

                    return m.useMin < def.RPM && m.useDay < def.RPD && m.useMinTok < (def.TPM || Infinity) && m.useDayTok < (def.TPD || Infinity);
                });

                if (candidates.length === 0) {
                    if (!noModelAvailable) {
                        Log.dev("No models currently available due to rate/token limits");
                        noModelAvailable = true;
                    }
                    continue;
                }

                const selected = candidates.sort(
                    (a, b) => a.useMin + a.useDay - (b.useMin + b.useDay)
                )[0];

                Log.flow([SLUG, `Selected model is ${selected.name}`], 3);

                const response = await GroqEngine.send(selected.name, req.messages);

                if (!req.completed) {
                    if (response.succ) {
                        req.callback(GRes.succ(response.message));
                    }
                    else {
                        req.callback(response);
                    }
                }
                req.completed = true;
                if (req.timeout) {
                    clearTimeout(req.timeout);
                    req.timeout = null;
                }
                if (response.extra?.tt) {
                    selected.useMinTok += response.extra.tt;
                    selected.useDayTok += response.extra.tt;
                }
                selected.useMin++;
                selected.useDay++;
                GroqEngine.queue.splice(i, 1);
                i--;
                processedOne = true;
                Log.flow([SLUG, `Usage for ${selected.name}: ${selected.useMin}/${models[selected.name].RPM} RPM, ${selected.useMinTok}/${models[selected.name].TPM ?? "∞"} TPM`], 3);
            }

            if (!processedOne) backoff = Math.min(backoff * 2, 2000);
            if (!processedOne) await GroqEngine.sleep(backoff);
        }

        noModelAvailable = false;

        GroqEngine.isRunning = false;
    };

    private static flush = async () => {
        while (GroqEngine.queue.length > 0 || GroqEngine.isRunning) {
            await GroqEngine.sleep(100);
        }
    }

    static shutdown = () => {
        return new Promise<boolean>(async (resolve, reject) => {
            await GroqEngine.flush();
            resolve(true);
        })
    }

    private static send = (model: ModelName, messages: Message[]) => {
        return new Promise<Res>(async (resolve, reject) => {
            try {
                const chatCompletion = await GroqEngine.client.chat.completions.create({
                    messages: messages as any,
                    model: model,
                    response_format: {
                        type: "json_object",
                    },
                    max_completion_tokens: 6000,
                    // reasoning_format: "hidden",
                });
                const totalTokens = chatCompletion.usage?.total_tokens || 0;
                const r = chatCompletion.choices.map(x => x.message.content).join("\n").replace(/[\n]{3, }/g, "\n\n");
                resolve(GRes.succ(r, { tt: totalTokens }));
            } catch (err) {
                Log.dev(err, (err as any).message);
                if (err instanceof Groq.APIError) {
                    resolve(GRes.err("API.GROQ_ERROR", { tr: true, reason: err.error.message || err.error.error?.message || err.message || err.name || err.status }));
                } else {
                    resolve(GRes.err("API.GROQ_ERROR", { tr: true, reason: (err as any).message || err }));
                }
            }
        });
    };

    static extractJSONResponse = (response: unknown) => {
        let r: any = null;
        try {
            if(typeof response != "string"){
                r = response;
            }
            else{
                try {
                    r = JSON.parse(response);
                } catch (error) {
                    r = extractJsonFromText(response);
                }
            }
        } catch (error) {
            r = null;
        }
        return r;
    }

    private static sleep = (ms: number) =>
        new Promise(resolve => setTimeout(resolve, ms));
}