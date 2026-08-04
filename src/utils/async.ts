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

export interface WalkPoolOptions {
  concurrency: number;
  /** Max nodes to visit; 0 or negative means unlimited. */
  maxItems: number;
  isCancelled?: () => boolean;
}

export interface WalkPoolResult {
  visited: number;
  truncated: boolean;
  cancelled: boolean;
}

/**
 * Walks a tree with a global concurrency pool. Unlike level-by-level batches,
 * workers pull the next pending node as soon as one finishes, so a single slow
 * node does not stall its siblings and deep trees are not serialized per level.
 *
 * The `expand` callback returns the child paths of a node; the pool pushes
 * them onto the shared queue and continues. Respects a max-item budget
 * (truncated) and a cancellation predicate (cancelled).
 */
export async function walkTree(
  root: string,
  expand: (path: string) => Promise<string[]>,
  opts: WalkPoolOptions,
): Promise<WalkPoolResult> {
  const queue: string[] = [root];
  const unlimited = opts.maxItems <= 0;
  let visited = 0;
  let truncated = false;
  let cancelled = false;
  let inFlight = 0;
  let finished = false;
  const idleWaiters: Array<() => void> = [];

  const wakeIdle = (): void => {
    const waiters = idleWaiters.splice(0);
    for (const wake of waiters) {
      wake();
    }
  };

  const stop = (): void => {
    finished = true;
    queue.length = 0;
    inFlight = 0;
    wakeIdle();
  };

  const waitForWork = (): Promise<void> =>
    new Promise<void>((resolve) => {
      idleWaiters.push(resolve);
    });

  const worker = async (): Promise<void> => {
    while (!finished) {
      if (opts.isCancelled?.()) {
        cancelled = true;
        stop();
        return;
      }
      if (!unlimited && visited >= opts.maxItems) {
        truncated = true;
        stop();
        return;
      }
      const path = queue.shift();
      if (path === undefined) {
        if (inFlight === 0) {
          finished = true;
          wakeIdle();
          return;
        }
        await waitForWork();
        continue;
      }
      inFlight += 1;
      visited += 1;
      try {
        const children = await expand(path);
        if (opts.isCancelled?.()) {
          cancelled = true;
          stop();
          return;
        }
        const remaining = unlimited ? children.length : opts.maxItems - visited;
        if (!unlimited && children.length > remaining) {
          truncated = true;
        }
        for (const child of children.slice(0, Math.max(0, remaining))) {
          queue.push(child);
        }
      } catch {
        // expand failed for this node (e.g. deleted mid-search); skip it
      } finally {
        if (!finished) {
          inFlight -= 1;
        }
        if (!finished && queue.length > 0) {
          wakeIdle();
        }
      }
    }
  };

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.max(1, opts.concurrency); i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return { visited, truncated, cancelled };
}
