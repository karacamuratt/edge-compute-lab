export default {
    async fetch(
        request: Request,
        env: Env,
        ctx: ExecutionContext
    ): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === "/health") {
            return Response.json({
                ok: true,
                service: "edge-gateway",
                ts: new Date().toISOString(),
                country: (request as any).cf?.country ?? "unknown",
                colo: (request as any).cf?.colo ?? "unknown",
            });
        }

        const apiKey = request.headers.get("x-api-key");

        if (!apiKey || apiKey !== env.EDGE_API_KEY) {
            return new Response("Unauthorized", { status: 401 });
        }

        const country = (request as any).cf?.country ?? "unknown";

        let originBase = env.ORIGIN_DEFAULT;

        const canaryRatio = Number(env.CANARY_RATIO || "0");
        const isCanary = Math.random() < canaryRatio;

        if (isCanary && env.ORIGIN_V2) {
            originBase = env.ORIGIN_V2;
        } else {
            if (country === "US" && env.ORIGIN_US) {
                originBase = env.ORIGIN_US;
            } else if (
                ["DE", "FR", "NL", "TR"].includes(country) &&
                env.ORIGIN_EU
            ) {
                originBase = env.ORIGIN_EU;
            } else {
                originBase = env.ORIGIN_DEFAULT;
            }
        }

        const originUrl = new URL(originBase);

        originUrl.pathname = url.pathname.replace(/^\/api/, "");
        originUrl.search = url.search;
        originUrl.searchParams.set(
            "__v",
            originBase === env.ORIGIN_V2 ? "v2" : "v1"
        );

        if (request.method === "GET") {
            const cache = await caches.open("edge-cache-v1");
            const cacheKey = new Request(originUrl.toString(), {
                method: "GET",
            });

            const cached = await cache.match(cacheKey);

            if (cached) {
                return cached;
            }

            const res = await fetch(originUrl.toString(), {
                method: "GET",
                headers: forwardHeaders(request),
            });

            const response = new Response(res.body, res);

            response.headers.set("Cache-Control", "public, max-age=30");
            response.headers.set("x-edge-origin", originBase);
            response.headers.set("x-canary", isCanary ? "true" : "false");
            response.headers.set("x-geo-country", country);

            ctx.waitUntil(cache.put(cacheKey, response.clone()));

            return response;
        }

        const res = await fetch(originUrl.toString(), {
            method: request.method,
            headers: forwardHeaders(request),
            body: request.body,
        });

        const response = new Response(res.body, res);

        response.headers.set("x-edge-origin", originBase);
        response.headers.set("x-canary", isCanary ? "true" : "false");
        response.headers.set("x-geo-country", country);

        return response;
    },
};

function forwardHeaders(req: Request) {
    const h = new Headers(req.headers);
    h.delete("host");

    return h;
}

export interface Env {
    ORIGIN_DEFAULT: string;
    ORIGIN_EU?: string;
    ORIGIN_US?: string;
    ORIGIN_V2?: string;
    EDGE_API_KEY: string;
    CANARY_RATIO: string;
}
