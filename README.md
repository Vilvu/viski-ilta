# 🥃 Whisky Tasting App

A web application for recording and tracking user whisky ratings from whisky tasting events.

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Azure Functions v4 (Node.js/TypeScript)
- **Database**: Azure Cosmos DB (serverless)
- **Auth**: Azure Static Web Apps built-in auth (Microsoft Entra ID) for sign-in only; authorization roles (`anonymous`/`taster`/`admin`) are app-managed in Cosmos DB — see [Deployment Guide § 4](docs/deployment.md#4-admin-role-assignment) for first-admin bootstrap
- **Hosting**: Azure Static Web Apps

## Project Structure

```
whisky-app/
├── frontend/          # React + Vite frontend
├── api/               # Azure Functions backend
├── docs/              # Project documentation
├── staticwebapp.config.json
└── .github/workflows/ # CI/CD
```

## Getting Started

### Prerequisites
- Node.js 20+
- Azure Functions Core Tools v4

### Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   cd frontend && npm install
   cd ../api && npm install
   ```
3. Copy `api/local.settings.json.example` to `api/local.settings.json`
4. Copy `.env.example` to `frontend/.env.local`
5. Start the API: `cd api && npm run dev`
6. Start the frontend: `cd frontend && npm run dev`


To use a real Cosmos DB instance instead, set `USE_COSMOS_MOCK` to `"false"` in `api/local.settings.json` and provide valid `COSMOS_ENDPOINT` and `COSMOS_KEY` values.

### Testing

Both packages use Vitest. From the repo root:

```bash
npm test              # run api tests, then frontend tests
npm run test:coverage # same, with coverage thresholds enforced
npm run typecheck     # typecheck production source and test files in both packages
```

Or per package: `npm test` / `npm run test:watch` / `npm run test:coverage` inside `api/` or `frontend/`. API tests
live under `api/test/`; frontend tests are colocated with their source as `*.test.ts(x)`. See the Testing section in
[claude.md](claude.md) for the mocking conventions (Cosmos fake, MSW handlers, provider wrapper). CI
(`.github/workflows/ci.yml`) runs lint, typecheck, and coverage-gated tests for both packages on every PR.

### Deployment

See the [Deployment Guide](docs/deployment.md) for comprehensive Azure setup, CI/CD configuration, and production deployment instructions.

## Documentation

- [Architecture](docs/architecture.md)
- [Deployment Guide](docs/deployment.md)
