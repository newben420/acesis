import axios, {
    AxiosAdapter,
    AxiosRequestConfig,
    AxiosResponse,
    InternalAxiosRequestConfig,
} from "axios";
import { fetch } from "undici";

const undiciAdapter: AxiosAdapter = async (
    config: AxiosRequestConfig
): Promise<AxiosResponse> => {
    // Build URL with params
    let url = config.url || "";

    if (config.params) {
        const parsed = new URL(url);
        Object.entries(config.params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                parsed.searchParams.append(key, String(value));
            }
        });
        url = parsed.toString();
    }

    const controller = new AbortController();
    if (config.timeout) {
        setTimeout(() => controller.abort(), config.timeout);
    }

    // Ensure headers is always a plain object
    const headers: Record<string, string> = {};
    if (config.headers) {
        if (typeof (config.headers as any).toJSON === "function") {
            Object.assign(headers, (config.headers as any).toJSON());
        } else {
            Object.assign(headers, config.headers);
        }
    }

    const response = await fetch(url, {
        method: (config.method || "get").toUpperCase(),
        headers,
        body: config.data as any,
        signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") || "";
    let data: any;
    if (contentType.includes("application/json")) {
        data = await response.json();
    } else {
        data = await response.text();
    }

    // Cast config to InternalAxiosRequestConfig to satisfy TypeScript
    const internalConfig = config as InternalAxiosRequestConfig;

    return {
        data,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        config: internalConfig,
        request: null,
    };
};

export const axiosUndici = axios.create({
    timeout: 30000,
    headers: {
        "user-agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    },
    adapter: undiciAdapter,
});