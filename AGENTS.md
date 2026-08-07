# Repository Guidelines

## Project Structure & Module Organization

This is an Angular 21/Ionic sign-language translation application. Code lives in `src/app/`: reusable UI in `components/`, route views in `pages/`, feature logic in `modules/`, and shared services, helpers, and NGXS state in `core/`. Colocate `*.spec.ts` tests with implementations. Static files and ML models belong in `src/assets/`; global SCSS in `src/theme/`; environment variants in `src/environments/`. Build utilities live in `tools/`, and VitePress documentation in `docs/`.

## Build, Test, and Development Commands

- `npm ci` installs locked dependencies (Node 18+ and npm 9+; CI uses Node 22).
- `npm start` generates license data, then serves the app on all interfaces with live reload.
- `npm run lint` checks TypeScript and Angular templates with Angular ESLint.
- `npm test` runs Karma/Jasmine in watch mode and writes coverage to `coverage/`.
- `npm run test:ci` runs the ChromeHeadless and FirefoxHeadless suites once, matching CI.
- `npm run build` creates the production browser bundle in `dist/sign-translate/browser/`.
- `npm run build:full` also regenerates paths, legal pages, licenses, sitemap, and docs.

## Coding Style & Naming Conventions

Prettier is authoritative: single quotes, no bracket spacing, ES5 trailing commas, and 120-character lines. Run `npx prettier --write <files>`; Husky also formats staged files through `lint-staged`. Follow Angular names such as `translate.service.ts`, `language-selector.component.ts`, and `dropzone.directive.ts`. Use kebab-case `app-*` element selectors and camelCase `app*` attribute directives. Keep feature-specific code within its feature.

## Testing Guidelines

Tests use Jasmine with Karma. Name them `<unit>.spec.ts` and add focused coverage for behavior changes, including accessibility where relevant. No minimum coverage threshold is configured. Before a PR, run `npm run lint` and `npm run test:ci`; use the browser-specific test scripts to isolate failures.

## Commit & Pull Request Guidelines

History follows Conventional Commits: `feat(scope):`, `fix(scope):`, `test(scope):`, `refactor(scope):`, `docs:`, and `ci:`. Use an imperative subject and tracker key when available, for example `fix(translate): preserve metadata [SIGN-582]`. PRs should explain the change and verification, link the issue, and include screenshots or recordings for UI changes. Keep unrelated formatting out of the diff; CI build, tests, lint, and Lighthouse checks must pass.

## Security & Configuration

Do not commit credentials or machine-specific environment values. For model files and generated PWA assets, document the source and size in the PR.
