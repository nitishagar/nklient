import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';

export interface RetryOptions {
  attempts?: number;
  delay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryOnStatusCodes?: number[];
}

export interface ClientConfig {
  baseUrl: string;
  defaultHeaders: Record<string, string>;
  timeout: number;
  maxRedirects: number;
  retry: {
    attempts: number;
    delay: number;
    maxDelay: number;
    retryOnStatusCodes: number[];
    backoffMultiplier: number;
  };
  keepAlive: boolean;
  cookies: boolean;
  followRedirects: boolean;
  decompress: boolean;
  rejectUnauthorized?: boolean;
}

export interface RequestConfig {
  method: string;
  uri: string;
  headers: Record<string, string>;
  body?: string | Buffer;
  timeout: number;
  maxRedirects: number;
  followRedirects: boolean;
  decompress: boolean;
  rejectUnauthorized: boolean;
}

export interface NklientResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: any;
}

export type RequestInterceptor = (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
export type ResponseInterceptor = (response: NklientResponse) => NklientResponse | Promise<NklientResponse>;

export interface InterceptorArrays {
  request: (RequestInterceptor | null)[];
  response: (ResponseInterceptor | null)[];
}

export interface DownloadProgress {
  loaded: number;
  total?: number;
}
