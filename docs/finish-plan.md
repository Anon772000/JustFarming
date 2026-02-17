# Project Finish Plan

This plan tracks the final hardening and handover work for the current Croxton East baseline.

## Phase 1: Baseline and Scope

- [x] Confirm repository state and running deployment baseline.
- [x] Confirm implemented route coverage against docs.
- [x] Define production-readiness priorities (runtime mode, build reliability, docs parity).

## Phase 2: Runtime and Deployment Hardening

- [x] Run API container in compiled runtime mode (`npm run start`) instead of watch mode.
- [x] Keep database bootstrap behavior (`prisma db push`) for current no-migrations baseline.
- [x] Bind API Docker port to localhost by default (`127.0.0.1:4000`) and serve external traffic through web proxy.
- [x] Set API `NODE_ENV=production` in Compose.

## Phase 3: Build Reliability

- [x] Make Prisma client generation automatic on install (`postinstall`).
- [x] Make server build self-healing by running Prisma generation in `prebuild`.
- [x] Validate backend and frontend production builds.

## Phase 4: Documentation Parity

- [x] Update `README.md` API access guidance (local API port + external proxy path).
- [x] Update `docs/api-endpoints.md` to match implemented endpoints.
- [x] Update `docs/architecture.md` endpoint coverage notes.
- [x] Update `AGENT.md` implemented coverage and runtime URL expectations.

## Phase 5: Validation and Handover

- [x] Rebuild and restart Docker stack on production host with new images.
- [x] Verify API + web health on production host after deployment.
- [ ] Optional follow-up: add first-class Prisma migrations and switch startup from `db push` to `migrate deploy`.
