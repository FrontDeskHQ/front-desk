# Keep integration credentials outside client-synced configuration

Organization-scoped connector credentials will live in encrypted server-only storage keyed to an integration. Live-State and `integration.configStr` may carry non-secret install identity and target metadata, but they must never carry OAuth access tokens, refresh tokens, or equivalent authorization material. Credential reads, replacement, rotation, and deletion remain server-only operations.

Linear requires rotating workspace OAuth tokens, while integration configuration is synchronized to browser clients. Reusing `configStr` would disclose those tokens. A connector-local store would split integration lifecycle state across deployments and make core disconnect and audit behavior unreliable. The server-only store becomes the shared credential seam; Linear uses it first, and Slack migration is separate work.

## Status

accepted
