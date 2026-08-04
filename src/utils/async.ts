/**
 * Maps items with a bounded concurrency window. Each batch is awaited before
 * the next starts, keeping the number of in-flight requests predictable.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    results.push(...(await Promise.all(batch.map(mapper))));
  }
  return results;
}
