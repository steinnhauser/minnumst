# Public Frontend Roadmap

This backlog is owned by the public archive frontend. Items that change shared API behavior must be coordinated with `eftirmal-api`; deployment/image work belongs in `eftirmal-deploy` and the image-owning repo. Ordered roughly from low-effort improvements to cross-service work.

## Quick Wins

- [x] Add accessible search suggestions while typing. Reuse `GET /api/people?query=...`; debounce input, ignore stale responses, bound results, and support keyboard navigation.
- [ ] Localize interface chrome in Icelandic and English. Keep authored names and story text unchanged; test labels, validation messages, empty states, and narrow layouts in both locales.

## Cross-Service Work

- [ ] Set the repository Actions variable `VITE_API_URL` to the production API origin, then create the first SemVer release tag and verify the private GHCR image is published. The tagged multi-platform publishing workflow is now implemented; deploy still needs a pinned image version.
- [ ] Add ancestor portrait display after the API defines a secure media contract, storage lifecycle, and public URL/access policy. Do not embed or fetch image blobs directly from MariaDB in the browser.

## Acceptance Notes

- Suggestions remain responsive, accessible, and bounded under fast typing and API latency.
- Both locales retain the public/read-only boundary and pass `make validate`.
- Do not mark image deployment ready until the tagged image is actually published and pinned in the deployment repository.
