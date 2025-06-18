# CLAUDE.md

This file provides guidance to Claude when working with code in this repository. Its goal is to make you an effective contributor to **nklient**.

## Commands

### Development
- **Install dependencies:** `npm install`
- **Run in watch mode:** `npm run dev` (rebuilds on file changes in `src/`)

### Building
- **Build for production:** `npm run build`
- This command transpiles TypeScript from `src/` to JavaScript in `dist/` and generates type definitions.

### Testing
- **Run all tests:** `npm test`
- **Run tests in watch mode:** `npm run test:watch`
- **Generate test coverage report:** `npm run coverage`
- Tests use **Jest** and are located in the `tests/` directory.
- **IMPORTANT:** Ensure test coverage remains at 85% or higher.

### Linting & Formatting
- **Run linter:** `npm run lint`
- **Fix linting issues automatically:** `npm run lint:fix`
- **Format code with Prettier:** `npm run format`

## Code Style & Conventions

- **Language:** This project uses **TypeScript**. Please add types for all new code.
- **Modules:** Use ES Modules (`import`/`export`) syntax.
- **Asynchronous Code:** Use `async/await` for all Promise-based operations.
- **Formatting:** Adhere to the `.prettierrc` configuration. Run `npm run format` before committing.
- **Documentation:** Add TSDoc comments to all exported functions, classes, and methods.

## Architecture Overview

**nklient** is a comprehensive, modern, and lightweight HTTP/S client for Node.js, built with TypeScript and a fluent API design.

### Directory Structure
- `src/`: All TypeScript source code.
- `dist/`: Compiled JavaScript output (do not edit directly).
- `tests/`: Jest test files.
- `examples/`: Usage examples.

### Core Components

1.  **`src/index.ts`**: The main entry point.
    - Exports factory functions for HTTP verbs: `get()`, `post()`, `put()`, `patch()`, `delete()`, `head()`.
    - Manages keep-alive agents for both `http` and `https` to optimize connection reuse.

2.  **`src/request.ts`**: Implements the `NklientRequest` class.
    - This is the core of the fluent API, returned by the verb methods (`get`, `post`, etc.).
    - Chainable methods: `headers()`, `body()`, `query()`, `timeout()`, `auth()`.
    - Terminal method: `exec()` returns a `Promise<NklientResponse>`.

3.  **`src/response.ts`**: Implements the `NklientResponse` class.
    - A standardized wrapper around the incoming HTTP response.
    - Provides easy access to `statusCode`, `headers`, `body`, and the raw response object.

4.  **`src/errors.ts`**: Defines custom error classes.
    - `NklientRequestError`: For network issues or non-2xx responses.
    - `NklientTimeoutError`: For requests that exceed their configured timeout.
    - **IMPORTANT:** When throwing errors, use these custom classes.

5.  **`src/utils.ts`**: Utility functions for internal use.

### Key Features & Processing Flow

- **HTTPS Support:** Handles `https` URLs seamlessly and securely.
- **Fluent API:** Example: `nklient.get(url).query({ id: 123 }).timeout(5000).exec()`
- **Automatic Redirect Following:** Follows 3xx redirects by default (can be disabled).
- **Automatic Body Parsing:** Parses response bodies as JSON or text based on the `Content-Type` header.
- **Automatic Decompression:** Handles `gzip` and `deflate` responses.
- **Typed:** Fully typed with TypeScript for a superior developer experience.

## Testing Approach

- Tests make actual HTTP requests to `https://httpbingo.org/`, which is a robust service for testing HTTP clients.
- When adding a new feature (e.g., adding proxy support):
    1.  Create a new test file `tests/proxy.test.ts` or add to an existing relevant file.
    2.  Write tests that cover the success case, failure cases, and edge cases.
    3.  Follow the existing `describe()` and `it()` structure.
    4.  Use Jest's `expect()` for assertions.

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

- [ ] **Retry Logic:** Add a `retry(count, delay)` method to handle transient failures.
- [ ] **Cookie Handling:** Automatically manage and send cookies.
- [ ] **Request Cancellation:** Implement cancellation using `AbortController`.
- [ ] **Streaming:** Support for streaming request and response bodies.
- [ ] **Plugin System:** Allow users to extend functionality with plugins.
- [ ] **Proxy Support:** Add a `proxy()` method to route requests through an HTTP/S proxy.
- [ ] **Browser Support:** Create a build that uses `fetch` for use in web browsers.