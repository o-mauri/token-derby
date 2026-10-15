# Web

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.1.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Linting

```bash
npm run lint
```

Runs Angular ESLint on `ui`, `site` and `admin`, then stylelint. The rules live in `eslint.config.js`; each project's own `eslint.config.js` only sets its selector prefix (`td`, `site`, `admin`).

House rules enforced as errors:

- Components stay OnPush (Angular 22's default); opting out with `ChangeDetectionStrategy.Eager` fails.
- Signal properties are `readonly`.
- No `document`, `window`, `localStorage`, `sessionStorage` or `location` globals in app code. Inject `DOCUMENT` or the app's tokens instead. Specs, stories, Storybook config, `preview/` fixtures and `e2e/` are exempt.
- Shapes are declared with `type`, not `interface`.

When a rule genuinely doesn't fit one line, disable it for that line only and say why in the same comment.

## Browser tests (Playwright)

One-off setup: `npx playwright install chromium`.

```bash
npm run e2e      # builds the site, type-checks e2e/, runs every spec
npm run e2e:ui   # Playwright's UI mode, against the last build
```

- The tests run the **production** `site` build, served by `e2e/serve.mjs` like CloudFront: real files as they are, app routes fall back to `index.html`, and a missing `.js`/`.css` 404s.
- The API is faked. `fakeApi(page, routes)` in `e2e/support/fake-api.ts` answers `/api/**` from route maps keyed `'METHOD /api/path'`. Route maps are built in `e2e/support/fixtures.ts`, mostly from the `/preview-*` fixtures. Any API call without a route fails the test, naming the call, and so does any console error.
- `signIn(page)` in `e2e/support/session.ts` seeds the session a real sign-in leaves behind.
- Three projects: `desktop` (1366×768), `phone` (390×844) and `phone-small` (360×780). Behaviour specs run on desktop; `layout.spec.ts` checks every page on all three for sideways scroll, and for page scroll on desktop.
- Web fonts load from Google Fonts for real, since VT323's narrow metrics are what keep pages within a phone's width. The run needs network access.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
