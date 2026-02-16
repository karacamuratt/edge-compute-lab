export class RateLimitCounter {
    constructor(private state: DurableObjectState) { }

    async fetch(request: Request) {
        const url = new URL(request.url);
        const key = url.searchParams.get("key");

        if (!key) {
            return new Response("Missing key", { status: 400 });
        }

        const now = Date.now();
        const windowMs = 60_000;
        const limit = 100;

        let data = (await this.state.storage.get("data")) as {
            count: number;
            start: number;
        } | null;

        if (!data || now - data.start > windowMs) {
            data = {
                count: 1,
                start: now,
            };

            await this.state.storage.put("data", data);

            return Response.json({
                allowed: true,
                remaining: limit - 1,
            });
        }

        if (data.count >= limit) {
            return new Response("Too Many Requests", { status: 429 });
        }

        data.count++;

        await this.state.storage.put("data", data);

        return Response.json({
            allowed: true,
            remaining: limit - data.count,
        });
    }
}
