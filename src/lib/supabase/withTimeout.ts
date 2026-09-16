const DEFAULT_TIMEOUT_MS = 15_000;

export class SupabaseTimeoutError extends Error {
  constructor() {
    super("Timed out reaching the server.");
    this.name = "SupabaseTimeoutError";
  }
}

/**
 * A request that hangs on a bad connection would otherwise leave callers
 * `await`ing forever — first found in cloudSync.ts's push/pull, since
 * reproduced again in the rival lookup before this got shared out. Every
 * Supabase call anywhere in the app should go through this: a stuck request
 * always settles, one way or another, within `timeoutMs`. The real fetch
 * may still be running in the background when this rejects — harmless for
 * a background sync or a one-off lookup, not worth threading an
 * AbortController through for.
 */
export function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new SupabaseTimeoutError()), timeoutMs);
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
