# Provider-neutral external-entity addressing

The external-entity mirror will expose common identity and display fields to the core while keeping provider addressing in an opaque connector reference. Common fields include the owning integration, stable provider-scoped key, mutable short reference, container identity and label, URL, content, state, and lifecycle timestamps. GitHub repository and issue-number details and Linear issue and team UUIDs belong in the opaque reference interpreted by their connector.

The existing `number` and `repoFullName` columns made a GitHub representation look generic. Encoding a Linear team as a repository would preserve that schema at the cost of a false domain model. A separate Linear mirror would instead duplicate linking, search, indexing, and completion behavior. The shared mirror stays authoritative for FrontDesk reads, and provider-specific knowledge stays behind the connector interface.

## Status

accepted
