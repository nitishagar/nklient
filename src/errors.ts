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
