export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === "/health") {
            return Response.json({
                ok: true,
                service: "edge-gateway",
                ts: new Date().toISOString(),
                country: (request as any).cf?.country ?? "unknown",
            });
        }

        const apiKey = request.headers.get("x-api-key");

        if (!apiKey || apiKey !== env.EDGE_API_KEY) {
            return new Response("Unauthorized", { status: 401 });
        }

        const origin = new URL(env.ORIGIN_BASE_URL);

        origin.pathname = url.pathname.replace(/^\/api/, "");
        origin.search = url.search;

        if (request.method === "GET") {
            const cache = await caches.open("edge-gateway-v1");
            const cacheKey = new Request(origin.toString(), request);
            const cached = await cache.match(cacheKey);

            if (cached) {
                return cached;
            }

            const res = await fetch(origin.toString(), {
                method: "GET",
                headers: forwardHeaders(request),
            });

            const cachedRes = new Response(res.body, res);

            cachedRes.headers.set("Cache-Control", "public, max-age=30");

            ctx.waitUntil(
                cache.put(cacheKey, cachedRes.clone())
            );

            return cachedRes;
        }

        return fetch(origin.toString(), {
            method: request.method,
            headers: forwardHeaders(request),
            body: request.body,
        });
    },
};

function forwardHeaders(req: Request) {
    const h = new Headers(req.headers);
    h.delete("host");

    return h;
}

export interface Env {
    ORIGIN_BASE_URL: string;
    EDGE_API_KEY: string;
}
