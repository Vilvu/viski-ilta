# ADR 0002: Bottle Photos and AI Bottle Recognition

## Status

Accepted

## Context

Catalog whiskeys were text-only. Two features were requested:

1. A bottle photo per whiskey, added when the whiskey is created or later from the edit form, and removable.
2. An optional "Recognize with AI" button that reads the bottle photo, fills the whiskey fields, and runs a
   *scoped* search for details the label does not show. Fields that cannot be determined stay empty.

`docs/architecture.md` §9 had already earmarked Azure Blob Storage for bottle images.

## Decisions

### Photos live in Azure Blob Storage, served through the API

- A new storage account (`infra/modules/storage.bicep`) holds a **private** `whiskey-images` container
  (`allowBlobPublicAccess: false`).
- The whiskey document stores `imageBlobName`, `imageContentType` and `imageUpdatedAt`. Only `imageUpdatedAt`
  is needed by the frontend; its presence means "has a photo".
- Photos are served by `GET /api/whiskeys/{id}/image`. The frontend appends `?v=<imageUpdatedAt>`, and every
  upload uses a new blob name, so the response is safely cached as `immutable`.
- Uploads are a raw image body to `PUT /api/whiskeys/{id}/image` (JPEG/PNG/WebP, max 5 MB), guarded by the
  same creator-or-admin rule as whiskey edits. Deleting the photo or the whiskey deletes the blob (best effort).
- The browser downscales photos to at most 1280 px and re-encodes them as JPEG before upload
  (`frontend/src/lib/image.ts`). Phone photos drop from several MB to a few hundred KB.
- Local development uses an in-memory store (`USE_BLOB_MOCK=true`), mirroring `USE_COSMOS_MOCK`.

**Alternatives rejected.** Storing base64 photos inline in Cosmos DB needs no new infrastructure, but Cosmos has
a 2 MB document limit and every whiskey read would carry the image bytes and RU cost. Public blob URLs or SAS
links would avoid proxying bytes through Functions, but add CORS, URL-expiry handling and a second origin, which
is not worth it at this traffic level.

### AI recognition uses the Anthropic Claude API with a scoped web search

- `POST /api/whiskeys/recognize?lang=en|fi` (taster role) sends the photo to Claude (`claude-opus-5-5`) and
  returns suggested values. Nothing is stored. See `api/src/lib/ai.ts`.
- The model reads the label first. The built-in web search tool is restricted with `allowed_domains` to whisky
  reference sites (whiskybase.com, masterofmalt.com, thewhiskyexchange.com, alko.fi) and `max_uses: 3`. The
  prompt only allows searching for the bottle identified from the label, and only for fields the label lacks.
- Structured outputs (`output_config.format`, JSON schema with nullable fields) guarantee the response shape.
  The API still validates every field (types and ranges) before returning it.
- `effort: 'low'` keeps latency within the ~45 s Static Web Apps managed-function limit. The client has a 40 s
  total budget and resumes at most two `pause_turn` continuations.
- Server-side refusal fallback (`fallbacks: 'default'`) is enabled. A refusal returns an all-empty result.
- The feature is optional. Without `ANTHROPIC_API_KEY` the endpoint returns 503 and the UI says recognition is
  not configured; everything else works.

**Alternative rejected.** Azure OpenAI would keep everything in the Azure subscription, but has no built-in web
search tool, so the scoped lookup would need a separate search service.

### AI values only fill empty fields

`frontend/src/lib/recognize.ts` merges the result into the form without overwriting anything the user already
typed. In edit mode, the user clears a field first to let the AI suggest a value. The UI reports how many fields
were filled and asks the user to check them before saving.

## Consequences

- New app settings: `BLOB_STORAGE_CONNECTION_STRING` (set by Bicep from the storage account key) and the optional
  `ANTHROPIC_API_KEY` (from the `ANTHROPIC_API_KEY` GitHub secret via the infra workflow). Infra must be
  redeployed before the photo feature works in Azure.
- Cost: storage is cents per month. Each recognition costs a few cents of Claude API usage plus web search
  usage when the model searches.
- Photos are public through the image route, like the rest of the catalog.
- Bottle photos are sent to the Anthropic API only when a user presses "Recognize with AI".
