# WhiskyApp — Context Index

Navigation hub for the WhiskyApp project documentation and planning artifacts.

## Core Documentation

| Document | Description |
|----------|-------------|
| [architecture.md](architecture.md) | System Architecture — tech stack, component design, Azure resources |
| [deployment.md](deployment.md) | Deployment Guide — Azure setup, CI/CD, local dev, troubleshooting |
| [adr/0001-unit-test-coverage.md](adr/0001-unit-test-coverage.md) | ADR — Unit test coverage strategy (Vitest, Cosmos test fake, MSW, thresholds) |
| [adr/0002-bottle-photos-and-ai-recognition.md](adr/0002-bottle-photos-and-ai-recognition.md) | ADR — Bottle photos in Blob Storage and AI bottle recognition with Claude |
| [adr/0003-native-auth.md](adr/0003-native-auth.md) | ADR — Native username/password sign-in (session cookie, credentials container, lockout) |

## Project Summary

**WhiskyApp** is a web application for recording and tracking user whisky ratings from whisky tasting events. It supports three user roles — Admin, Authenticated User, and Anonymous User — with Microsoft Entra ID or native username/password authentication, hosted on Microsoft Azure.

### Key Technology Choices

- **Frontend**: React + TypeScript + Vite → Azure Static Web Apps
- **Backend**: Azure Functions with Node.js + TypeScript — serverless
- **Database**: Azure Cosmos DB — NoSQL with flexible schema
- **Authentication**: Azure Static Web Apps built-in auth with Microsoft Entra ID provider, plus native username/password accounts (app-managed session cookie)
- **API**: RESTful design proxied through Static Web Apps

## Planning Artifacts

- `plans/` — Implementation plans organized by date
- `journal/` — Development journal entries organized by date
