let cachedNewPricing: { value: boolean; expiresAt: number } | null = null;

export async function getNewPricingFlag(env: { FEATURE_FLAGS: KVNamespace }) {
    const now = Date.now();

    if (cachedNewPricing && now < cachedNewPricing.expiresAt) {
        return cachedNewPricing.value;
    }

    const raw = await env.FEATURE_FLAGS.get("new_pricing");
    const value = raw === "true";

    cachedNewPricing = { value, expiresAt: now + 30_000 };

    return value;
}
