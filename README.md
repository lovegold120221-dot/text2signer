<h1 align="center">👋 Sign Translate</h1>

<p align="center">
  <i>
    Revolutionizing Sign Language Communication with Cutting-Edge Real-Time Translation Models.
    <br>
    Enjoy seamless Sign Language Translation on desktop and mobile.
  </i>
</p>

<p align="center">
  <a href="https://rylo.com/sign/translate/"><strong>Eburon Translate</strong></a>
  <br>
</p>

<p align="center">
  <a href="https://github.com/sign/.github/blob/main/CONTRIBUTING.md">Contribution Guidelines</a>
  ·
  <a href="https://github.com/sign/translate/issues">Submit an Issue</a>
</p>

<p align="center">
  <a href="https://github.com/sign/translate/actions/workflows/client.yml">
    <img src="https://github.com/sign/translate/actions/workflows/client.yml/badge.svg" alt="Client Build Test Status Badge" />
  </a>
<a href="https://coveralls.io/github/sign/translate?branch=master">
    <img src="https://coveralls.io/repos/github/sign/translate/badge.svg?branch=master" alt="Coverage Status Badge" />
  </a>
  <a href="https://github.com/sign/translate/blob/master/LICENSE.md">
    <img src="https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg" alt="License: CC BY-NC-SA 4.0 Badge" />
  </a>
</p>

<p align="center">
  <a href="https://github.com/sign/translate/stargazers" target="_blank">
    <img src="https://img.shields.io/github/stars/sign/translate" alt="GitHub Stars for sign/translate" />
  </a>
  <a href="https://github.com/sign/translate/network/members" target="_blank">
    <img src="https://img.shields.io/github/forks/sign/translate" alt="GitHub Forks for sign/translate" />
  </a>
  <a href="https://github.com/sign/translate/issues" target="_blank">
    <img src="https://img.shields.io/github/issues/sign/translate" alt="GitHub Issues for sign/translate" />
  </a>
</p>

<p align="center">
  <a href="https://rylo.com/sign/translate" target="_blank">
    <img src="src/assets/promotional/about/hero.webp" alt="Sign Language Translation Demo Image" />
  </a>
</p>

<hr>

## Key Features

### [Sign Language Production](https://github.com/sign/translate/wiki/Spoken-to-Signed)

```
┌─────────────────────┐
│Spoken Language Audio│                                                              ┌─────────┐
└─────────┬───────────┘                                                  ┌──────────►│Human GAN│
          │                                                              │           └─────────┘
          ▼                                                              │
┌────────────────────┐     ┌───────────────┐     ┌───────────┐    ┌──────┴──────┐    ┌───────────────┐
│Spoken Language Text├────►│Normalized Text├────►│SignWriting├───►│Pose Sequence├───►│Skeleton Viewer│
└─────────┬──────────┘     └───────────────┘     └───────────┘    └──────┬──────┘    └───────────────┘
          │                        ▲                   ▲                 │
          ▼                        │                   │                 │           ┌─────────┐
┌───────────────────────┐          │                   │                 └──────────►│3D Avatar│
│Language Identification├──────────┘───────────────────┘                             └─────────┘
└───────────────────────┘
```

### [Sign Language Translation](https://github.com/sign/translate/wiki/Signed-to-Spoken)

```
┌──────────────────────────┐                                ┌────────────────────┐
│Upload Sign Language Video│                      ┌────────►│Spoken Language Text│
└──────────┬───────────────┘                      │         └──────────┬─────────┘
           │                                      │                    │
           │          ┌────────────┐       ┌──────┴────┐               │
           ├─────────►│Segmentation├──────►│SignWriting│               │
           │          └────────────┘       └───────────┘               │
           │                                                           ▼
┌──────────┴────────────────┐                               ┌─────────────────────┐
│Camera Sign Language Video │                               │Spoken Language Audio│
└───────────────────────────┘                               └─────────────────────┘
```

### Want to Help?

Join us on the journey to revolutionize sign language communication.
Follow our progress on the [Project Board][project-board],
shape the project's future,
and delve deeper into our vision and plans in the [Wiki][wiki].

Wish to report a bug, contribute some code, or enhance documentation? Fantastic!
Check our guidelines for [contributing][contributing] and then explore our issues marked as <kbd>[help wanted](https://github.com/sign/translate/labels/help%20wanted)</kbd> or <kbd>[good first issue](https://github.com/sign/translate/labels/good%20first%20issue)</kbd>.

**Find this useful? Give our repo a star :star: :arrow_up:.**

[![Stargazers repo roster for @sign/translate](https://reporoster.com/stars/sign/translate)](https://github.com/sign/translate/stargazers)

[wiki]: https://github.com/sign/translate/wiki/Spoken-to-Signed
[contributing]: https://github.com/sign/.github/blob/main/CONTRIBUTING.md
[project-board]: https://github.com/sign/translate/projects/1

## Development

### Prerequisites

- Install [Node.js] which includes [Node Package Manager][npm]

### Setting Up the Project

Install dependencies locally:

```bash
npm install
```

Run the application:

```bash
npm start
```

Test the application:

```bash
npm test
```

### Deploying to Vercel

This project is Vercel-ready as a static (prerendered) deployment. The Angular
app is built with base-href `/` and the prerendered `browser/` output is served
directly — Vercel's Angular preset uses the generated `index.csr.html` as the
SPA fallback for client-side routes.

Configuration lives in `vercel.json`:

- **Build command:** `npm run build:vercel`
- **Output directory:** `dist/sign-translate/browser`

#### CLI deployment

```bash
# Build & verify locally (outputs to .vercel/output)
npx vercel build

# Preview deployment
npx vercel

# Production deployment
npx vercel --prod
```

#### Git / Dashboard deployment

1. Push this repository to GitHub (or import it directly).
2. In the Vercel dashboard choose **New Project → Import** the repository.
3. Vercel auto-detects the `angular` framework; leave the defaults from
   `vercel.json` (build command and output directory are pre-filled).
4. Click **Deploy**.

> **Note:** the app's canonical URL and `robots.txt`/`opensearch.xml` are
> generated from `base-path.json` (`https://rylo.com/sign/translate/`) by
> `tools/apply-base-path.js`. The Vercel build keeps that origin for SEO — if
> you attach a custom domain, update `base-path.json` and run
> `npm run generate:base-path` before deploying.

[node.js]: https://nodejs.org/
[npm]: https://www.npmjs.com/get-npm

### Cite

```bibtex
@misc{moryossef2023signmt,
    title={Eburon Translate: Effortless Real-Time Sign Language Translation},
    author={Moryossef, Amit},
    howpublished={\url{https://rylo.com/sign/translate/}},
    year={2023}
}
```
