/// <reference types="node" />

import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';
import { CookieJar } from 'tough-cookie';
import { Readable } from 'stream';

declare module 'nklient' {
  export interface RetryOptions {
    attempts?: number;
    delay?: number;
    maxDelay?: number;
    backoff?: number;
    retryOn?: number[];
  }

  export interface RequestOptions {
    uri?: string;
    method?: string;
    headers?: Record<string, string | string[]>;
    body?: any;
    timeout?: number;
    encoding?: string | null;
    jar?: CookieJar | null;
    agent?: HttpAgent | HttpsAgent;
    proxy?: string;
    maxRedirects?: number;
    retry?: RetryOptions;
    stream?: boolean;
    rejectUnauthorized?: boolean;
    allowHttpsToHttp?: boolean;
    blockPrivateNetworks?: boolean;
    allowedDomains?: string[];
    blockedDomains?: string[];
    [key: string]: any;
  }

  export interface Response {
    statusCode: number;
    headers: Record<string, string | string[]>;
    body: any;
    request: {
      uri: string;
      method: string;
      headers: Record<string, string | string[]>;
    };
  }

  export interface StreamResponse {
    statusCode: number;
    headers: Record<string, string | string[]>;
    body: Readable;
  }

  export interface Interceptor<T> {
    (config: T): T | Promise<T>;
  }

  export interface InterceptorManager<T> {
    use(interceptor: Interceptor<T>): number;
    eject(id: number): void;
  }

  export interface Interceptors {
    request: InterceptorManager<RequestOptions>;
    response: InterceptorManager<Response>;
  }

  export class RequestWrapper {
    constructor(method: string, uri: string);
    
    headers(name: string, value: string): this;
    headers(headers: Record<string, string>): this;
    body(data: any): this;
    postBody(data: any): this;
    timeout(ms: number): this;
    query(params: Record<string, any>): this;
    form(data: Record<string, any>): this;
    json(data: any): this;
    proxy(proxyUrl: string): this;
    agent(agent: HttpAgent | HttpsAgent): this;
    jar(jar?: CookieJar): this;
    noJar(): this;
    cookies(cookies: string | Record<string, string>): this;
    retry(options: RetryOptions): this;
    maxRedirects(count: number): this;
    encoding(enc: string | null): this;
    stream(): this;
    rejectUnauthorized(value: boolean): this;
    allowHttpsToHttp(value?: boolean): this;
    blockPrivateNetworks(value?: boolean): this;
    allowedDomains(domains: string[]): this;
    blockedDomains(domains: string[]): this;
    exec(): Promise<Response | StreamResponse>;
    then<TResult1 = Response | StreamResponse, TResult2 = never>(
      onfulfilled?: ((value: Response | StreamResponse) => TResult1 | PromiseLike<TResult1>) | undefined | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
    ): Promise<TResult1 | TResult2>;
    catch<TResult = never>(
      onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null
    ): Promise<Response | StreamResponse | TResult>;
  }

  export interface Cookie {
    key: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: Date;
    maxAge?: number;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
  }

  export interface NKlient {
    get(uri: string): RequestWrapper;
    post(uri: string): RequestWrapper;
    put(uri: string): RequestWrapper;
    patch(uri: string): RequestWrapper;
    delete(uri: string): RequestWrapper;
    head(uri: string): RequestWrapper;
    options(uri: string): RequestWrapper;
    request(options: RequestOptions | string): Promise<Response>;
    interceptors: Interceptors;
    jar(): CookieJar;
    getCookies(url: string, jar?: CookieJar): Promise<Cookie[]>;
    setCookie(cookie: string | Cookie, url: string, jar?: CookieJar): Promise<void>;
    clearCookies(jar?: CookieJar): void;
    defaults(options: Partial<RequestOptions>): void;
    create(defaults?: Partial<RequestOptions>): NKlient;
  }

  const nklient: NKlient;
  export default nklient;
  export = nklient;
}
```

index.js
