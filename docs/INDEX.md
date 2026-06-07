# WhiskyApp — Context Index

Navigation hub for the WhiskyApp project documentation and planning artifacts.

## Core Documentation

| Document | Description |
|----------|-------------|
| [prd.md](prd.md) | Product Requirements Document — goals, user stories, acceptance criteria |
| [architecture.md](architecture.md) | System Architecture — tech stack, component design, Azure resources |
| [technical.md](technical.md) | Technical Specification — data models, API specs, auth flows, schemas |
| [deployment.md](deployment.md) | Deployment Guide — Azure setup, CI/CD, local dev, troubleshooting |
| [TODO.md](TODO.md) | Development Task List — phased implementation plan |

## Project Summary

**WhiskyApp** is a web application for recording and tracking user whisky ratings from whisky tasting events. It supports three user roles — Admin, Authenticated User, and Anonymous User — with Microsoft Entra ID authentication, hosted on Microsoft Azure.

### Key Technology Choices

- **Frontend**: React + TypeScript + Vite → Azure Static Web Apps
- **Backend**: Azure Functions with Node.js + TypeScript — serverless
- **Database**: Azure Cosmos DB — NoSQL with flexible schema
- **Authentication**: Azure Static Web Apps built-in auth with Microsoft Entra ID provider
- **API**: RESTful design proxied through Static Web Apps

## Planning Artifacts

- `plans/` — Implementation plans organized by date
- `journal/` — Development journal entries organized by date
