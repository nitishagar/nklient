# Cookie Management Implementation

This document describes the cookie management features added to nklient.

## Features Implemented

### 1. Automatic Cookie Handling (Already Existed)
- Cookies are automatically stored from `Set-Cookie` headers
- Cookies are automatically sent with subsequent requests to the same domain
- Uses `tough-cookie` library for RFC-compliant cookie handling

### 2. New `.cookies()` Method
A fluent API method to manually set cookies for a request:

```javascript
// String format
nklient.get('https://example.com/api')
  .cookies('session=abc123; user=john')
  .exec();

// Object format
nklient.get('https://example.com/api')
  .cookies({ session: 'abc123', user: 'john' })
  .exec();
```

### 3. Cookie Management Functions
New functions added to the main nklient object:

- `nklient.getCookies(url, jar?)` - Get all cookies for a URL
- `nklient.setCookie(cookie, url, jar?)` - Set a cookie for a URL
- `nklient.clearCookies(jar?)` - Clear all cookies in a jar

### 4. Cookie Security Features
The implementation properly handles:
- Domain restrictions - cookies are only sent to matching domains
- Path restrictions - cookies respect path attributes
- Secure cookies - only sent over HTTPS
- HttpOnly cookies - properly marked and handled
- Cookie expiration - expired cookies are not sent

## Usage Examples

### Basic Cookie Usage
```javascript
// Using global cookie jar (default)
await nklient.get('https://example.com/login').exec();
// Cookies from login are automatically sent
await nklient.get('https://example.com/profile').exec();
```

### Manual Cookie Setting
```javascript
// Set cookies for a specific request
const response = await nklient
  .get('https://api.example.com/data')
  .cookies({ auth: 'token123', session: 'xyz789' })
  .exec();
```

### Custom Cookie Jar
```javascript
// Create isolated cookie jar
const jar = nklient.jar();

// Use custom jar for requests
await nklient.get('https://example.com/api')
  .jar(jar)
  .exec();

// Get cookies from jar
const cookies = await nklient.getCookies('https://example.com', jar);
```

### Cookie Management
```javascript
// Set cookie manually
await nklient.setCookie('manual=value; Path=/; HttpOnly', 'https://example.com');

// Get all cookies
const cookies = await nklient.getCookies('https://example.com');

// Clear all cookies
nklient.clearCookies();
```

## Implementation Details

1. **Integration with tough-cookie**: The implementation uses the battle-tested `tough-cookie` library for proper RFC 6265 compliance.

2. **Fluent API**: The `.cookies()` method returns `this` to maintain method chaining.

3. **Type Safety**: TypeScript definitions have been updated to include all new methods.

4. **Backward Compatibility**: All existing cookie functionality remains unchanged.

5. **Test Coverage**: Comprehensive tests added covering:
   - String and object format cookie setting
   - Domain and path restrictions
   - Secure and HttpOnly cookies
   - Cookie expiration
   - Integration with existing jar functionality

## Files Modified

1. `/index.js` - Added `.cookies()` method and cookie management functions
2. `/index.d.ts` - Added TypeScript definitions
3. `/tests/index.js` - Added comprehensive cookie tests
4. `/util/index.js` - Fixed `extend` function to support multiple sources
5. `/examples/cookie-handling.js` - Created new example file

## Notes

The implementation ensures that cookies respect all security attributes and behave correctly according to RFC 6265. The `.cookies()` method provides a convenient way to set cookies manually while maintaining the automatic cookie handling that was already in place.