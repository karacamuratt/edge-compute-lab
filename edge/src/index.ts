import { logInfo, logError, nowMs, ObsContext } from "./obs";
import { getNewPricingFlag } from "./flags";
import { shardKey } from "./utils/shard";

let failureCount = 0;
let lastFailureTs = 0;

const MAX_FAILURES = 5;
const RESET_AFTER_MS = 10_000;

// Timeout Wrapper
async function fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs = 2500
) {
    const controller = new AbortController();

    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(id);
    }
}

export default {
    async fetch(
        request: Request,
        env: Env,
        ctx: ExecutionContext
    ): Promise<Response> {
        const start = nowMs();
        const traceId = crypto.randomUUID();
        const url = new URL(request.url);

        const country = (request as any).cf?.country ?? "unknown";
        const colo = (request as any).cf?.colo ?? "unknown";

        try {
            // Health Check
            if (url.pathname === "/health") {
                return Response.json({
                    ok: true,
                    service: "edge-gateway",
                    ts: new Date().toISOString(),
                    country,
                    colo,
                });
            }

            // Auth
            const apiKey = request.headers.get("x-api-key");

            if (!apiKey || apiKey !== env.EDGE_API_KEY) {
                return new Response("Unauthorized", { status: 401 });
            }

            // Rate Limit (Sharded)
            const ip =
                request.headers.get("cf-connecting-ip") ||
                request.headers.get("x-forwarded-for") ||
                "unknown";

            const SHARD_COUNT = 16;

            const shard = shardKey(ip, SHARD_COUNT);

            const id = env.RATE_LIMITER.idFromName(
                `rl-${shard}-${ip}`
            );

            const stub = env.RATE_LIMITER.get(id);

            const rlRes = await stub.fetch(
                `https://rl/check?key=${ip}`
            );

            if (rlRes.status === 429) {
                return new Response("Rate limit exceeded", {
                    status: 429,
                });
            }

            // Headers
            const headers = forwardHeaders(request);

            headers.set("x-trace-id", traceId);

            const newPricingEnabled =
                await getNewPricingFlag(env);

            if (newPricingEnabled) {
                headers.set("x-feature-new-pricing", "1");
            }

            // Canary + Geo Routing
            let originBase = env.ORIGIN_DEFAULT;

            const canaryRatio = Number(
                env.CANARY_RATIO || "0"
            );

            const isCanary = Math.random() < canaryRatio;

            if (isCanary && env.ORIGIN_V2) {
                originBase = env.ORIGIN_V2;
            } else if (country === "US" && env.ORIGIN_US) {
                originBase = env.ORIGIN_US;
            } else if (
                ["DE", "FR", "NL", "TR"].includes(country) &&
                env.ORIGIN_EU
            ) {
                originBase = env.ORIGIN_EU;
            }

            // Observability
            const obsCtx: ObsContext = {
                traceId,
                country,
                colo,
                isCanary,
                originBase,
                method: request.method,
                path: url.pathname,
            };

            logInfo("edge.request.start", obsCtx);

            // Circuit Breaker
            if (
                failureCount >= MAX_FAILURES &&
                Date.now() - lastFailureTs <
                RESET_AFTER_MS
            ) {
                logError(
                    "edge.circuit.open",
                    obsCtx,
                    null,
                    {
                        failures: failureCount,
                    }
                );

                return new Response(
                    "Upstream temporarily unavailable",
                    { status: 503 }
                );
            }

            // Building the origin URL
            const originUrl = new URL(originBase);

            originUrl.pathname = url.pathname.replace(
                /^\/api/,
                ""
            );

            originUrl.search = url.search;

            originUrl.searchParams.set(
                "__v",
                originBase === env.ORIGIN_V2
                    ? "v2"
                    : "v1"
            );

            // GET + Cache
            if (request.method === "GET") {
                const cache = await caches.open(
                    "edge-cache-v1"
                );

                const cacheKey = new Request(
                    originUrl.toString(),
                    { method: "GET" }
                );

                const cached = await cache.match(cacheKey);

                if (cached) {
                    cached.headers.set(
                        "x-cache",
                        "HIT"
                    );

                    return cached;
                }

                const res = await fetchWithTimeout(
                    originUrl.toString(),
                    {
                        method: "GET",
                        headers,
                    }
                );

                failureCount = 0;

                const response = new Response(
                    res.body,
                    res
                );

                const durationMs =
                    nowMs() - start;

                response.headers.set(
                    "Cache-Control",
                    "public, max-age=120"
                );

                response.headers.set(
                    "x-trace-id",
                    traceId
                );

                response.headers.set(
                    "x-edge-origin",
                    originBase
                );

                response.headers.set(
                    "x-canary",
                    String(isCanary)
                );

                response.headers.set(
                    "x-geo-country",
                    country
                );

                response.headers.set(
                    "x-edge-duration-ms",
                    String(durationMs)
                );

                response.headers.set(
                    "x-cache",
                    "MISS"
                );

                ctx.waitUntil(
                    cache.put(
                        cacheKey,
                        response.clone()
                    )
                );

                logInfo("edge.request.end", obsCtx, {
                    durationMs,
                    status: response.status,
                    cache: "miss",
                });

                return response;
            }

            // Non-GET, no cache
            const res = await fetchWithTimeout(
                originUrl.toString(),
                {
                    method: request.method,
                    headers,
                    body: request.body,
                }
            );

            failureCount = 0;

            const response = new Response(
                res.body,
                res
            );

            const durationMs =
                nowMs() - start;

            response.headers.set(
                "x-trace-id",
                traceId
            );

            response.headers.set(
                "x-edge-origin",
                originBase
            );

            response.headers.set(
                "x-canary",
                String(isCanary)
            );

            response.headers.set(
                "x-geo-country",
                country
            );

            response.headers.set(
                "x-edge-duration-ms",
                String(durationMs)
            );

            logInfo("edge.request.end", obsCtx, {
                durationMs,
                status: response.status,
            });

            return response;
        } catch (err) {
            failureCount++;
            lastFailureTs = Date.now();

            const durationMs =
                nowMs() - start;

            const obsCtx: ObsContext = {
                traceId,
                country,
                colo,
                isCanary: false,
                originBase: "unknown",
                method: request.method,
                path: url.pathname,
            };

            logError(
                "edge.request.error",
                obsCtx,
                err,
                {
                    durationMs,
                }
            );

            return new Response(
                "Upstream timeout",
                { status: 504 }
            );
        }
    },
};

function forwardHeaders(req: Request) {
    const headers = new Headers();

    req.headers.forEach((value, key) => {
        headers.set(key, value);
    });

    headers.delete("host");

    return headers;
}

// Env types
export interface Env {
    ORIGIN_DEFAULT: string;
    ORIGIN_EU?: string;
    ORIGIN_US?: string;
    ORIGIN_V2?: string;

    EDGE_API_KEY: string;
    CANARY_RATIO: string;

    RATE_LIMITER: DurableObjectNamespace;
    FEATURE_FLAGS: KVNamespace;
}

// Export for Durable Objects
export {
    RateLimitCounterV2,
    RateLimitCounter,
} from "./ratelimit/counter";
