/** Error types shared by every AI provider. The Gemini* names are kept so existing imports keep working. */

export type GeminiErrorCode =
  | 'MISSING_KEY'
  | 'INVALID_KEY'
  | 'PERMISSION_DENIED'
  | 'QUOTA_EXCEEDED'
  | 'MODEL_NOT_FOUND'
  | 'BAD_REQUEST'
  | 'BLOCKED'
  | 'EMPTY_RESPONSE'
  | 'SERVER_ERROR'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'NETWORK'
  | 'PARSE'
  | 'UNKNOWN';

export class GeminiHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.name = 'GeminiHttpError'; this.status = status; }
}
export class GeminiBlockedError extends Error {
  constructor(message: string) { super(message); this.name = 'GeminiBlockedError'; }
}
export class GeminiEmptyResponseError extends Error {
  constructor(message = 'The AI returned an empty response. Try again.') { super(message); this.name = 'GeminiEmptyResponseError'; }
}
export class GeminiTruncatedError extends Error {
  constructor(message = 'The AI stopped before completing the response. Raise maxOutputTokens and try again.') { super(message); this.name = 'GeminiTruncatedError'; }
}
export class GeminiError extends GeminiHttpError {
  readonly code: GeminiErrorCode;
  readonly httpStatus?: number;
  /** Server-suggested wait before retrying (quota / overload). */
  readonly retryAfterMs?: number;

  constructor(
    code: GeminiErrorCode,
    message: string,
    extra: { httpStatus?: number; retryAfterMs?: number; cause?: unknown } = {},
  ) {
    super(extra.httpStatus ?? 0, message);
    this.name = 'GeminiError';
    this.code = code;
    this.httpStatus = extra.httpStatus;
    this.retryAfterMs = extra.retryAfterMs;
  }
}

/** Thrown when a key is saved but still encrypted for this session. Reported as MISSING_KEY so callers treat it uniformly. */
export class KeyLockedError extends GeminiError {
  constructor(message = 'Your AI key is locked for this session. Unlock it with the banner at the top of the page or in Settings, then try again.') {
    super('MISSING_KEY', message);
    this.name = 'KeyLockedError';
  }
}

export function isGeminiError(err: unknown): err is GeminiError {
  return err instanceof GeminiError;
}

/** User-presentable message for any thrown value. */
export function describeError(err: unknown): string {
  if (isGeminiError(err)) return err.message;
  return err instanceof Error ? err.message : 'Something went wrong.';
}

