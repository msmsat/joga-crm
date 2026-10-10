import type { ApiError } from '../api/client';

/** HTTP 402 alone also means a studio billing restriction, not a missing pass. */
export function needsSubscription(error: ApiError, required: boolean | undefined): boolean {
  return required === true && error.status === 402 && error.code === 'NO_FUNDING';
}
