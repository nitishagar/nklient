import { URL } from 'url';

/**
 * Appends query parameters to a URL string.
 * Merges with any existing query parameters.
 */
export function addQueryToUrl(url: string, params: Record<string, any>): string {
  if (!params || typeof params !== 'object' || Object.keys(params).length === 0) {
    return url;
  }

  const urlObj = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      urlObj.searchParams.append(key, String(value));
    }
  }
  return urlObj.toString();
}
