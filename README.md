# 🐦 Birdle 

A small web game to learn birds: look at a photo, pick the right name out of four.

## 📖 Table of Contents

- [🤔 Project Presentation](#-project-presentation)
- [🛠️ Prerequisites](#️-prerequisites)
- [🚀 Installation and Startup](#-installation-and-startup)
  - [🌍 Global Startup (Docker)](#-global-startup-docker)
  - [🧰 Local Startup (Dev)](#-local-startup-dev)
- [🎮 How the Game Works](#-how-the-game-works)
- [🔐 Environment Variables (.env)](#-environment-variables-env)
- [🐳 Docker Architecture and Security (Hardening)](#-docker-architecture-and-security-hardening)
  - [📦 Services](#-services)
  - [🛡️ Applied Hardening](#️-applied-hardening)
- [🗂️ Repository Structure](#️-repository-structure)
- [🌐 API Endpoints](#-api-endpoints)
- [📎 Useful Commands](#-useful-commands)
- [🧭 Roadmap](#-roadmap)
- [👤 Author](#-author)
- [🪢 Appendix](#-appendix)

## 🤔 Project Presentation

**Birdle** is a simple web app to learn how to recognize birds. The game shows a bird
photo and four names; you pick the right one. It keeps a score and a streak.

When you launch it, you **pick a region** (or all regions), a **game mode**, and a
**difficulty**, then play with the birds from that region. Names are shown **in French**
plus the **scientific (Latin)** name below.

The project has two parts running in **one container**:

- **Frontend**: static `HTML · Tailwind CSS · vanilla JavaScript`, served by the same Node server.
- **Backend**: a small `Node · Express` server that acts as a **secure proxy** to the
  [Nuthatch API](https://nuthatch.lastelm.software/). It also fetches French names from
  **Wikidata** and caches everything in memory.

**Why a backend?** Two reasons:

1. The **API key stays on the server** and is never sent to the browser.
2. The server **caches the birds** at startup, so playing a round makes **zero** extra
   calls to Nuthatch, this protects the API quota (500 requests/hour).

The browser only talks to the local `/api/*` routes; it never sees the key or the
Nuthatch/Wikidata URLs.

## 🛠️ Prerequisites

- Git
- Docker + Docker Compose **(recommended)**
- *or* Node.js ≥ 20 for local development

## 🚀 Installation and Startup

Clone the repository, then move into it:

```bash
git clone <your-repo-url> birdle
cd birdle
```

### 🌍 Global Startup (Docker)

From the project root:

```bash
cp .env.example .env      # then fill in NUTHATCH_API_KEY
docker compose up --build
```

| Service | Container | URL                          |
|---------|-----------|------------------------------|
| App     | `birdle`  | http://localhost:3000        |
| Health  | `birdle`  | http://localhost:3000/api/health |

### 🧰 Local Startup (Dev)

```bash
cp .env.example .env      # then fill in NUTHATCH_API_KEY
npm install
npm start                 # or: npm run dev  (auto-reload)
```

Then open http://localhost:3000

## 🎮 How the Game Works

On startup, the server:

1. Downloads the full list of birds **that have a photo** from Nuthatch (all regions).
2. Asks **Wikidata** (one grouped SPARQL query, no key needed) for the **French name** of
   each bird, using its scientific name as the key.
3. Builds the list of available regions (only those with at least 4 birds).
4. Caches everything in memory and refreshes it every `CACHE_TTL_HOURS`.

The player first picks a region from `/api/regions` (or "all regions") and a difficulty.
Each call to `/api/quiz?region=...&difficulty=...` picks one random bird + three decoys,
shuffles them, and returns the photo, the four French names (with their Latin name), and
the answer. If a bird has no known French name, the app falls back to the English name.

The **difficulty** changes how the three decoys are chosen, using each bird's taxonomic
family/order:

- **easy**: decoys from a different family (very easy to tell apart).
- **medium**: random decoys from the region.
- **hard**: decoys from the same family as the answer (easy to confuse).

The **game mode** is handled in the browser:

- **Classic**: endless, just keep guessing (score + streak).
- **3 lives**: three wrong answers and the game ends; you can replay right away.
- **Time trial**: score as many birds as possible in 60 seconds (auto-advances after each answer).

## 🔐 Environment Variables (.env)

The `.env` file holds your secrets and is **not** versioned (`.env.example` is the template).

| Variable           | Default                 | Role                                                        |
|--------------------|-------------------------|-------------------------------------------------------------|
| `NUTHATCH_API_KEY` |                        | Your Nuthatch API key (**required**)                        |
| `PORT`             | `3000`                  | Port the server listens on                                  |
| `REGION_FILTER`    | `europe`                | Default region used when the request sends none (lowercase) |
| `CACHE_TTL_HOURS`  | `12`                    | How long the bird cache lives before a refresh              |

> ⚠️ **Security note:** if your API key ever leaks (for example, pasted in a chat or a
> commit), treat it as compromised and **generate a new one** at
> https://nuthatch.lastelm.software/getKey.html

## 🐳 Docker Architecture and Security (Hardening)

### 📦 Services

Defined in `docker-compose.yml`:

- **birdle**: `node:20-alpine`, multi-step-friendly build. It installs only production
  dependencies, serves the static frontend on port `80`→`3000`, and exposes the `/api/*`
  proxy. A `HEALTHCHECK` hits `/api/health`.

There is no database: the bird data lives in memory and comes from the Nuthatch API.

### 🛡️ Applied Hardening

- **API key kept server-side** : never sent to the browser.
- **`helmet`** : security headers + a Content-Security-Policy.
- **`express-rate-limit`** : 60 requests/minute per IP on `/api`.
- **Non-root container** : runs as the built-in `node` user.
- **Locked-down container** : `read_only` filesystem, `no-new-privileges`,
  `cap_drop: ALL`, a `tmpfs` for `/tmp`, plus memory and PID limits.
- **`.env` not committed** : excluded from Git and from the Docker build context.
- **Healthcheck** : Compose knows when the app is actually ready.

> Note on CSP: Tailwind is loaded from its official CDN (`cdn.tailwindcss.com`), which
> requires `'unsafe-eval'` in `script-src`. For a stricter CSP in production, replace the
> CDN with a pre-built Tailwind stylesheet served as a static file.

## 🗂️ Repository Structure

```
birdle/
|-- .env.example
|-- .gitignore
|-- .dockerignore
|-- Dockerfile
|-- docker-compose.yml
|-- package.json
|-- server.js          # Express backend: Nuthatch proxy + cache + Wikidata translation
|-- README.md
`-- public/            # static frontend (served by the same server)
    |-- index.html     # game page (Tailwind, dark theme, no-scroll layout)
    `-- app.js         # game logic (fetch quiz, score, streak, feedback)
```

## 🌐 API Endpoints

| Method | Route          | Role                                                   |
|--------|----------------|--------------------------------------------------------|
| GET    | `/`              | The static game page                                   |
| GET    | `/api/regions`   | Available regions (with bird counts) + total           |
| GET    | `/api/quiz?region=&difficulty=` | One question: photo, 4 options, answer (difficulty: easy/medium/hard) |
| GET    | `/api/health`    | Status + number of birds and regions cached            |

## 📎 Useful Commands

Start the full stack:

```bash
docker compose up --build
```

Stop the app:

```bash
docker compose down
```

Rebuild after a change:

```bash
docker compose up -d --build
```

Follow the logs:

```bash
docker compose logs -f birdle
```

Run locally without Docker:

```bash
npm install && npm start
```

## 🧭 Roadmap

- More regions and game modes.
- A bird detail page (scientific name, conservation status, region already returned by the API).
- Timed mode, high scores, and more.

## 👤 Author

**LEFEBVRE Nino** : design & development.

## 🪢 Appendix

- 🐦 Bird data & photos — [Nuthatch API](https://nuthatch.lastelm.software/)
- 🌍 French names — [Wikidata](https://www.wikidata.org/) (SPARQL query service)
                                                    