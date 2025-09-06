# CLAUDE.md

This file provides guidance to Claude when working with code in this repository. Its goal is to make you an effective contributor to **nklient**.

## Commands

### Development
- **Install dependencies:** `npm install`

### Testing
- **Run all tests:** `npm test`
- **Run tests in watch mode:** `npm run test:watch`
- **Generate test coverage report:** `npm run test:coverage`
- Tests use **Mocha** and are located in the `tests/` directory.
- **IMPORTANT:** Ensure test coverage remains at 85% or higher.

### Linting & Formatting
- **Run linter:** `npm run lint`
- **Fix linting issues automatically:** `npm run lint:fix`
- **Format code with Prettier:** `npm run format`

## Code Style & Conventions

- **Language:** This project uses **JavaScript** with comprehensive JSDoc comments.
- **Modules:** Use CommonJS (`require`/`module.exports`) syntax.
- **Asynchronous Code:** Use `async/await` for all Promise-based operations.
- **Formatting:** Adhere to the `.prettierrc` configuration. Run `npm run format` before committing.
- **Documentation:** Add JSDoc comments to all exported functions, classes, and methods.

## Architecture Overview

**nklient** is a comprehensive, modern, and lightweight HTTP/S client for Node.js, built with JavaScript and a fluent API design.

### Directory Structure
- `index.js`: Main implementation file
- `index.d.ts`: TypeScript type definitions
- `util/`: Utility functions
- `tests/`: Mocha test files
- `examples/`: Usage examples
- `config/`: Configuration schemas and loaders

### Core Components

1.  **`index.js`**: The main entry point.
    - Exports factory functions for HTTP verbs: `get()`, `post()`, `put()`, `patch()`, `delete()`, `head()`, `options()`.
    - Manages keep-alive agents for both `http` and `https` to optimize connection reuse.
    - Contains the `RequestWrapper` class that implements the fluent API.
    - Handles all HTTP request logic, streaming, cookies, and response processing.

2.  **`util/index.js`**: Utility functions.
    - `isJSON()`: Checks if content is JSON.
    - `extend()`: Deep object merging.
    - Cookie-related utilities.

3.  **`config/ConfigLoader.js`**: Configuration management.
    - Schema-based validation with AJV.
    - Loads and validates client configurations.

4.  **`index.d.ts`**: TypeScript type definitions.
    - Provides full type support for TypeScript users.
    - Defines interfaces for requests, responses, and options.

### Key Features & Processing Flow

- **HTTPS Support:** Handles `https` URLs seamlessly and securely.
- **Fluent API:** Example: `nklient.get(url).query({ id: 123 }).timeout(5000).exec()`
- **Automatic Redirect Following:** Follows 3xx redirects by default (can be disabled).
- **Automatic Body Parsing:** Parses response bodies as JSON or text based on the `Content-Type` header.
- **Automatic Decompression:** Handles `gzip` and `deflate` responses.
- **Typed:** Fully typed with TypeScript for a superior developer experience.

## Testing Approach

- Tests make actual HTTP requests to `https://httpbingo.org/`, which is a robust service for testing HTTP clients.
- Tests use Nock for mocking HTTP requests to ensure consistent and fast test execution.
- When adding a new feature (e.g., adding proxy support):
    1.  Create a new test file `tests/proxy.test.js` or add to an existing relevant file.
    2.  Write tests that cover the success case, failure cases, and edge cases.
    3.  Follow the existing `describe()` and `it()` structure.
    4.  Use Chai's `expect()` for assertions.

## Contribution Workflow

1.  **Branching:** Create a new branch from `main` with a descriptive name:
    - `feature/add-retry-logic`
    - `fix/response-parsing-bug`
    - `docs/update-readme`
2.  **Commits:** Write clear, concise commit messages following the [Conventional Commits](https://www.conventionalcommits.org/) specification (e.g., `feat: add support for request cancellation`).
3.  **Pull Request (PR):**
    - Ensure all tests are passing (`npm test`).
    - Ensure the linter is clean (`npm run lint`).
    - Open a PR against the `main` branch.
    - In the PR description, explain the changes and link to any relevant issues.

## Future Roadmap & TODOs

This is a list of features we want to add. Feel free to pick one up!

- [x] **Retry Logic:** ~~Add a `retry(count, delay)` method to handle transient failures.~~ ✅ Implemented
- [x] **Cookie Handling:** ~~Automatically manage and send cookies.~~ ✅ Implemented
- [ ] **Request Cancellation:** Implement cancellation using `AbortController`.
- [x] **Streaming:** ~~Support for streaming request and response bodies.~~ ✅ Implemented
- [ ] **Plugin System:** Allow users to extend functionality with plugins.
- [x] **Proxy Support:** ~~Add a `proxy()` method to route requests through an HTTP/S proxy.~~ ✅ Implemented
- [ ] **Browser Support:** Create a build that uses `fetch` for use in web browsers.