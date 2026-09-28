# Core owns authorization custody; connectors own credential semantics

Authorization is split at one seam, extending ADR-0023. FrontDesk core issues, verifies and consumes authorization state. It stores and rotates the encrypted credential blob using a version compare-and-swap, merges connector-supplied config patches, and enables and disconnects the integration. Core treats the credential as opaque: it never validates its shape, checks scopes or refreshes tokens. The connector alone builds the authorize URL, exchanges the callback code, validates the credential, derives config, refreshes tokens and revokes access. Connectors opt in through a manifest flag, so no core procedure names a provider.

Revocation belongs to the authorization lifecycle, like the liveness probe in ADR-0010, not to a capability such as issue tracking.

Alternatives considered:
- Provider-specific internal routes, as Linear first shipped. Every new connector would duplicate the state checks and credential custody, and core would grow provider branches.
- A core-defined credential shape. It fixes one mechanism, OAuth access/refresh tokens, into core, when only the connector ever reads the token.
- Connector-local credential storage, already rejected in ADR-0023.

Trade-off: connector hosts call these procedures with the internal API key. Any holder of that key can read any organization's integration credential. We accept this for now. A narrower connector-host credential tier is the known follow-up if the set of internal key holders grows.

Slack is the next connector expected to adopt this seam (see ADR-0023).

## Status

accepted
