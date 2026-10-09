/** Bound the entire request, including response parsing. Abort alone is insufficient
 * for transports that never settle, so callers also receive a rejected promise. */
export class RequestTimeoutError extends Error {
  readonly code = 'REQUEST_TIMEOUT';

  constructor() {
    super('Request timed out');
    this.name = 'RequestTimeoutError';
  }
}

export async function withRequestTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  callerSignal?: AbortSignal | null,
  timeoutMs = 30_000,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new RequestTimeoutError());
      controller.abort();
    }, timeoutMs);
    cancel = () => {
      reject(callerSignal?.reason ?? new Error('Request cancelled'));
      controller.abort();
    };
    if (callerSignal?.aborted) cancel();
    else callerSignal?.addEventListener('abort', cancel, { once: true });
  });
  try {
    return await Promise.race([deadline, operation(controller.signal)]);
  } finally {
    clearTimeout(timer);
    if (cancel) callerSignal?.removeEventListener('abort', cancel);
  }
}
