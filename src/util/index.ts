/**
 * Checks if a content type header indicates JSON content.
 * Handles charset variants like 'application/json; charset=utf-8'.
 */
export function isJSON(contentType: string | undefined | null): boolean {
  if (!contentType) return false;
  return contentType.includes('application/json');
}

/**
 * Shallow merge objects into destination object.
 * Only copies own enumerable properties.
 */
export function extend<T extends Record<string, any>>(destination: T, ...sources: Array<Record<string, any> | null | undefined>): T {
  for (const source of sources) {
    if (source) {
      for (const property of Object.keys(source)) {
        if (Object.prototype.hasOwnProperty.call(source, property)) {
          (destination as any)[property] = source[property];
        }
      }
    }
  }
  return destination;
}
