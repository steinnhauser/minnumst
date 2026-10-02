# Admin Frontend Roadmap

This backlog is owned by the editorial studio. The API remains the source of truth for people and immutable blog revisions. Items needing data/API changes must be coordinated with `eftirmal-api`.

## Quick Wins

- [x] Expose person-name editing through the existing `PATCH /api/people/{person_id}` endpoint, with normalized-name conflict feedback and focused tests.
- [ ] Localize the editor interface in Icelandic and English. Preserve entered story content as authored; test validation, loading, save status, history, and preview in both locales.
- [ ] Warn before discarding an unsaved story draft when changing selection or starting another page.

## Cross-Service Work

- [ ] Add secure profile-portrait selection/upload only after the API defines the media contract, size/type validation, storage, authorization, and delete/retention behavior. The current API has no image upload or fetch route; do not store image bytes in browser state or imply this feature exists.
- [ ] Verify Authentik protects the admin route in the deployed environment. Authentication is upstream in Traefik/Authentik; do not add an app-local login or Google Authenticator implementation here.
- [ ] Set the repository Actions variable `VITE_API_URL` to the production API origin, then create the first SemVer release tag and verify the private GHCR image is published. The tagged multi-platform publishing workflow is now implemented; deploy still needs a pinned image version.

## Acceptance Notes

- Blog saves append immutable revisions and never overwrite history.
- Use stable person IDs for edits; names/slugs are not mutation identifiers.
- Keep all UI states accessible and run `make validate`.
