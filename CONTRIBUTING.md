# Contributing

## Running tests

```bash
npm test                # run all tests
npm run test:coverage   # run with coverage report
```

## Rules for every change

- **New tool** → add tests in `tests/tools.test.ts` covering the happy path, error path, and any filtering/pagination logic
- **New client function** → add tests in `tests/google-health-client.test.ts`
- **Auth change** → add tests in `tests/auth.test.ts`

Coverage thresholds are enforced automatically — the test run will fail if coverage drops below 80% statements / 75% branches.

## How missed tests are caught

| Layer | When it runs | What it blocks |
|-------|-------------|----------------|
| Pre-push git hook | Every `git push` | Push is rejected if tests fail |
| GitHub Actions CI | Every PR and push to `main` | PR cannot be merged if CI is red |
| Coverage thresholds | Part of every test run | Fails if new code is untested |

This means a change without tests will be caught locally before it leaves your machine, and again in CI before it can reach `main`.

## Releasing a new version

1. Update `CHANGELOG.md` with a new `## [x.y.z] - YYYY-MM-DD` section
2. Bump the version in `package.json`
3. Commit, push, and create a GitHub release tagged `vx.y.z`
