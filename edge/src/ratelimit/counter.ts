export class RateLimitCounter {
    state: DurableObjectState;

    constructor(state: DurableObjectState) {
        this.state = state;
    }

    async fetch(request: Request) {
        const url = new URL(request.url);
        const key = url.searchParams.get("key");

        if (!key) {
            return new Response("Missing key", { status: 400 });
        }

        const now = Date.now();
        const window = 60_000;
        const limit = 100;

        const data = (await this.state.storage.get("data")) as {
            count: number;
            start: number;
        } | undefined;

        if (!data || now - data.start > window) {
            await this.state.storage.put("data", {
                count: 1,
                start: now,
            });

            return Response.json({ allowed: true, remaining: limit - 1 });
        }

        if (data.count >= limit) {
            return new Response("Too Many Requests", {
                status: 429,
            });
        }

        data.count++;

        await this.state.storage.put("data", data);

        return Response.json({
            allowed: true,
            remaining: limit - data.count,
        });
    }
}
