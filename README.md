# AuditLens — Website Intelligence Platform

> Professional SEO, Accessibility & AI Visibility auditing for modern websites.

AuditLens crawls your website and runs 1,600+ checks across three pillars — SEO, Accessibility (WCAG), and AI Visibility (GEO) — then generates a detailed score and action plan.

---

## Features

- **SEO Audit** — Technical SEO, on-page, off-page, structured data, performance
- **Accessibility Audit** — WCAG 2.1/2.2 AA compliance, usability checks
- **AI Visibility (GEO)** — Content readiness for ChatGPT, Perplexity, Google AI
- **Smart Crawler** — Playwright-based crawler with JS rendering & screenshot capture
- **Score & Report** — Overall score out of 100 with HTML + JSON reports
- **Dashboard UI** — Clean Next.js dashboard to manage and view all audits
- **REST API** — Fastify API server for programmatic access

---

## Screenshots

### Dashboard
![Dashboard](docs/dashboard.png)

### Audit Results
![Audit Results](docs/audit-results.png)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (Node.js 20+) |
| Crawler | Playwright |
| Accessibility | axe-core, Pa11y |
| API | Fastify 5.0 |
| Dashboard | Next.js 14 + React |
| Storage | File-based JSON |
| AI APIs | Anthropic Claude, OpenAI, Perplexity |

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm 9+

### Installation

```bash
git clone https://github.com/kuldeep088-hub/auditlens.git
cd auditlens

npm install
npm run build
```

### Configuration

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:

```env
ANTHROPIC_API_KEY=sk-ant-...       # Required for GEO analysis
OPENAI_API_KEY=sk-...              # Optional (ChatGPT visibility)
GOOGLE_API_KEY=                    # Optional (Google AI visibility)
PORT=3100
STORAGE_DIR=./data
```

---

## Usage

### Run an Audit (CLI)

```bash
# Audit any website
npx tsx scripts/run-audit.ts https://example.com

# With options
npx tsx scripts/run-audit.ts https://example.com --max-pages 50 --pillars seo,au,geo
```

**CLI Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--max-pages` | 1000 | Max pages to crawl |
| `--pillars` | seo,au,geo | Audit types to run |
| `--crawl-delay` | 1000ms | Delay between requests |
| `--no-js` | off | Disable JS rendering |
| `--output` | ./data | Output directory |

### Start the Dashboard

```bash
# Terminal 1 — Start API server
npm run dev:api

# Terminal 2 — Start Dashboard
npm run dev --workspace=apps/dashboard
```

Then open **http://localhost:3000**

---

## Audit Results

Reports are saved to `data/reports/`:

- **HTML report** — Interactive visual report (open in browser)
- **JSON report** — Machine-readable data export

### Sample Output

```
╔══════════════════════════════════════════════════════╗
║                  AuditLens v0.1                     ║
╚══════════════════════════════════════════════════════╝

  URL:        https://example.com
  Pillars:    seo, au, geo
  Max pages:  50

─── Phase 1: Crawling ─────────────────────────────────
  ✓ Crawl complete: 50 pages in 14m 54s

─── Phase 2: Analyzing ────────────────────────────────
  ✓ SEO: 81 checks completed
  ✓ AU: 1500 checks completed
  ✓ GEO: 21 checks completed
  Total: 1602 checks across 3 pillars

─── Phase 3: Scoring ──────────────────────────────────
  Overall Score: 78.2/100
  SEO: 75.8/100
  AU: 90.6/100
  GEO: 69.9/100
  Issues: 99 critical, 117 high, 283 warnings

╔══════════════════════════════════════════════════════╗
║  AUDIT COMPLETE — Score:  78.2/100                  ║
║  Duration: 15m 7s                                   ║
╚══════════════════════════════════════════════════════╝
```

---

## Project Structure

```
auditlens/
├── apps/
│   ├── api/              # Fastify REST API server
│   └── dashboard/        # Next.js web dashboard
├── packages/
│   ├── crawler/          # Playwright web crawler
│   ├── seo-engine/       # SEO audit engine
│   ├── au-engine/        # Accessibility audit engine
│   ├── geo-engine/       # AI visibility audit engine
│   ├── scoring/          # Score aggregation
│   ├── reporter/         # HTML & JSON report generation
│   ├── types/            # Shared TypeScript types
│   └── db/               # Data persistence layer
├── scripts/
│   └── run-audit.ts      # CLI entry point
├── docker-compose.yml    # Docker deployment
└── .env.example          # Environment variables template
```

---

## API Reference

### Start an Audit

```http
POST /api/audits
Content-Type: application/json

{
  "url": "https://example.com",
  "maxPages": 50,
  "pillars": ["seo", "au", "geo"]
}
```

### Get Audit Status

```http
GET /api/audits/:id
```

### List All Audits

```http
GET /api/audits
```

### Get Audit Checks

```http
GET /api/audits/:id/checks
```

### Get HTML Report

```http
GET /api/audits/:id/report
```

---

## Docker Deployment

```bash
cp .env.example .env
# Fill in your API keys

docker-compose up -d
```

- API: http://localhost:3100
- Dashboard: http://localhost:3000

---

## Deploy to Cloud

### Railway (API) + Vercel (Dashboard)

1. Push to GitHub
2. Deploy API on [Railway](https://railway.app) — set root directory to `apps/api`
3. Deploy Dashboard on [Vercel](https://vercel.com) — set root directory to `apps/dashboard`
4. Set `NEXT_PUBLIC_API_URL` on Vercel to your Railway API URL

---

## Scoring

Scores are calculated hierarchically:

```
Check Score (0-100)
  → Category Score (weighted average)
    → Pillar Score (SEO / AU / GEO)
      → Overall Score (0-100)
```

**Severity levels:** Critical · High · Warning · Info

---

## License

MIT — free to use, modify, and distribute.

---

## Author

Built with ❤️ by [kuldeep088-hub](https://github.com/kuldeep088-hub)
