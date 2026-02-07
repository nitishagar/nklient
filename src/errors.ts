export class NklientError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'NklientError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class TimeoutError extends NklientError {
  constructor(message = 'Request timeout') {
    super(message, 'ETIMEDOUT');
    this.name = 'TimeoutError';
  }
}

export class RetryExhaustedError extends NklientError {
  attempts: number;
  lastError: Error;

  constructor(attempts: number, lastError: Error) {
    super(
      `Request failed after ${attempts} attempt(s): ${lastError.message}`,
      'ERR_RETRY_EXHAUSTED'
    );
    this.name = 'RetryExhaustedError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

export class MaxRedirectsError extends NklientError {
  redirectCount: number;

  constructor(redirectCount: number) {
    super(`Maximum redirects exceeded (${redirectCount})`, 'ERR_MAX_REDIRECTS');
    this.name = 'MaxRedirectsError';
    this.redirectCount = redirectCount;
  }
}

export class ResponseTooLargeError extends NklientError {
  maxSize: number;

  constructor(maxSize: number) {
    super(`Response body too large (limit: ${maxSize} bytes)`, 'ERR_RESPONSE_TOO_LARGE');
    this.name = 'ResponseTooLargeError';
    this.maxSize = maxSize;
  }
}
