export function shardKey(
    key: string,
    shardCount = 16
): number {
    let hash = 0;

    for (let i = 0; i < key.length; i++) {
        hash = (hash << 5) - hash + key.charCodeAt(i);
        hash |= 0;
    }

    return Math.abs(hash) % shardCount;
}
