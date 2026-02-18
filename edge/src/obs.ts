export type ObsContext = {
    traceId: string;
    country: string;
    colo: string;
    isCanary: boolean;
    originBase: string;
    method: string;
    path: string;
};

export function nowMs() {
    return Date.now();
}

export function logInfo(event: string, ctx: ObsContext, extra?: Record<string, unknown>) {
    console.log(
        JSON.stringify({
            level: "info",
            event,
            ...ctx,
            ...extra,
            ts: new Date().toISOString(),
        })
    );
}

export function logError(event: string, ctx: ObsContext, err: unknown, extra?: Record<string, unknown>) {
    const e = err as any;
    console.log(
        JSON.stringify({
            level: "error",
            event,
            ...ctx,
            errorName: e?.name,
            errorMessage: e?.message,
            ts: new Date().toISOString(),
            ...extra,
        })
    );
}
