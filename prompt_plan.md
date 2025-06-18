**Prompt Plan for Upgrading `nklient` to Production-Ready HTTP Client**

This document outlines a step-by-step plan to refactor and enhance the `nklient` repository into a robust, easy-to-use HTTP client for first-time Node.js users. Each step includes tasks for code changes, configuration support, testing, documentation, and commit strategy to maintain code quality and prevent overwhelming changes.

---

## 1. Project Initialization & Baseline

- **1.1. Fork & Clone**: Ensure you have a fresh fork/clone of the current `nklient` repo.
- **1.2. Create `develop` Branch**: Set up a `develop` branch as the integration point for all feature work.
- **1.3. Add Linting & Formatting**:
  - Install ESLint with a beginner-friendly style guide (e.g., Airbnb base).
  - Set up Prettier for consistent formatting.
  - Add `npm run lint` and `npm run format` scripts.
- **1.4. CI Pipeline Setup**:
  - Configure GitHub Actions to run linting and tests on every pull request.

**Commit**: Initial scaffolding, linting, and CI setup.  
**Branch**: `develop`  
**Testing**: Confirm linting passes; run `npm test` (timeout: 15s)  

---

## 2. Configuration-Driven API Design

- **2.1. Define Config Schema**:
  - Create a `config` folder with a JSON Schema (`client-config.schema.json`).
  - Schema fields: base URL, default headers, timeout defaults, max redirects, retry policy.
- **2.2. Load & Validate Config**:
  - Add a `ConfigLoader` utility to validate user-provided config against schema.
  - Default config object in `index.js` when none provided.
- **2.3. Simplify API Surface**:
  - Introduce `createClient(config)` factory function that returns bound HTTP methods.
  - Deprecate global methods (`exports.get/post`), encourage `const client = createClient(config);` usage.

**Commit**: Config schema + loader + factory API.  
**Branch**: feature/config-driven-api  
**Testing**: Add tests for valid/invalid configs; ensure existing tests still pass.  

---

## 3. HTTPS & Protocol Support

- **3.1. Add HTTPS Module**:
  - Swap out built-in `http` module for conditional `http`/`https` based on URL protocol.
  - Update internal agent management to maintain separate agents per protocol.
- **3.2. Update RequestWrapper**:
  - Ensure `.exec()` selects correct transport.
  - Expose protocol option in config.

**Commit**: HTTPS support and protocol tests.  
**Branch**: feature/https-support  
**Testing**: Mock both HTTP and HTTPS endpoints in tests.  

---

## 4. Advanced Features

- **4.1. Retry Logic**:
  - Build retry mechanism in `RequestWrapper` respecting exponential backoff and max retries from config.
- **4.2. Cookie Handling**:
  - Integrate basic cookie jar (e.g., `tough-cookie`) for automatic cookie persistence.
- **4.3. Redirect Limits**:
  - Allow user to configure max redirect hops.

**Commit**: Retry & cookie modules.  
**Branch**: feature/retries-cookies  
**Testing**: Tests for retries on transient errors; cookie set/get across requests.  

---

## 5. Developer Experience & Documentation

- **5.1. Examples & Quickstart**:
  - Add `examples/` directory with minimal code snippets showcasing config-driven usage:
    ```js
    const { createClient } = require('nklient');
    const client = createClient({ baseUrl: 'https://api.example.com', timeout: 5000 });
    client.get('/users').exec().then(console.log);
    ```
- **5.2. README.md Refresh**:
  - Update README to highlight quickstart, config options, and advanced sections.
- **5.3. CLI Tooling (Optional)**:
  - Consider adding a simple CLI wrapper (`nklient-cli`) for ad hoc HTTP calls.

**Commit**: Docs, examples, READMEs.  
**Branch**: docs/refresh  
**Testing**: Ensure examples run without errors locally.  

---

## 6. Testing & Quality Assurance

- **6.1. Expand Test Suite**:
  - Cover new config loader, protocol multiplexing, retry/cookie behavior.
  - Use Mocha with Should.js; hit mock servers or use Nock for HTTP/HTTPS mocks.
- **6.2. Performance Benchmarks**:
  - Add simple benchmarks (optional) to measure request latency and agent reuse.
- **6.3. Code Coverage**:
  - Integrate nyc for coverage reports; aim for ≥90% coverage.

**Commit**: New tests & coverage.  
**Branch**: test/expand-suite  
**Testing**: `npm test` & `npm run coverage`  

---

## 7. Incremental Integration & Periodic Commits

- **7.1. Small, Focused PRs**:
  - Limit each PR to a single feature or improvement.
  - Reference this plan in PR descriptions.
- **7.2. Commit Frequency**:
  - Aim for 1–2 commits per day per feature branch.
  - Use meaningful commit messages: `[feature] add retry logic; [fix] schema validation error`
- **7.3. Code Reviews & Merge**:
  - Self-review via Claude Code: prompt "Run tests & lint, summarize diffs".
  - Merge to `develop` only after green CI and passing tests.

---

## 8. Release & Versioning

- **8.1. Semantic Versioning**:
  - Tag releases as `v1.0.0`, `v1.1.0`, etc. following semver.
- **8.2. Changelog**:
  - Maintain `CHANGELOG.md` with user-facing changes per release.
- **8.3. Publish to npm**:
  - Configure `package.json` with proper metadata (keywords, repository URL).
  - Automate `npm publish` via GitHub Actions on tags.

**Commit**: Release automation.  
**Branch**: release/v1.0.0  
**Testing**: Dry-run npm publish to test registry.  

---

## 9. Ongoing Maintenance

- **9.1. Issue Tracker**:
  - Label issues by `enhancement`, `bug`, `help wanted`.
- **9.2. Community Guidelines**:
  - Add `CONTRIBUTING.md` with contributing and code of conduct.
- **9.3. Roadmap**:
  - Publish `ROADMAP.md` outlining future features (e.g., GraphQL support, request caching).

**Final Commit**: Project fully production-ready.

---

*Follow this plan step-by-step, using periodic, small commits and leveraging Claude Code for automated testing and self-reviews to ensure a clean, maintainable, and user-friendly HTTP client for Node.js.*

