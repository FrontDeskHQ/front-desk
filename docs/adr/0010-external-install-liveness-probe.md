# External install liveness as framework substrate

Silent reconnect of a disabled [integration](../../CONTEXT.md) must not trust stored install identity alone: the [external install](../../CONTEXT.md) may have been removed while FrontDesk was disabled. We check [external install liveness](../../CONTEXT.md) through a **framework** HTTP contract — not a [Capability](../../CONTEXT.md) — and keep provider connect/OAuth URLs provider-specific (per ADR-0008).

## Status

accepted

## Decisions

- **Liveness is framework substrate, not a Capability.** It is orthogonal to `issue-tracker` / `pr-tracker` / `support-entry-point` / `notification-center`. Do not bolt `probe` onto those interfaces or invent a `connection` capability for this.
- **Standardized connector-host path:** `POST /api/connection/probe`. Same secret and timeout conventions as capability invoke; request forwards the integration's opaque `configStr`. Response is read-only: `{ live: boolean, configStr?: string }` where optional `configStr` is a sanitized suggestion (install identity stripped) for the core to persist — the probe itself never writes FrontDesk state.
- **Core orchestration:** `integration.reenable` mutation. If an integration row exists, the API runs the probe when the connector manifest opts in (`supportsConnectionProbe: true`); on `live: true` it sets `enabled: true` without refreshing install metadata; on `live: false` it writes the suggested `configStr` (when present) and returns `needs_connect`; on transport/unknown failure it fails soft (error to UI, no enable, no clear). Connectors that have not opted in never silent-enable — `reenable` returns `needs_connect`.
- **Web choreography:** If an integration row exists, Enable calls `reenable` and branches on `{ outcome: "enabled" | "needs_connect" }`. Provider install/OAuth URLs stay in the settings UI (ADR-0008 control plane). No row → existing first-time connect path.
- **Webhook clearing is complementary.** Provider-private uninstall events (e.g. GitHub `installation.deleted`) clear install identity and typically set `enabled: false` via existing bot mutations. Probe covers missed deliveries; webhooks cover the common path without waiting for Enable.
- **Rollout:** GitHub opts in first. Emitting-only connectors (Discord/Slack) omit `supportsConnectionProbe` until they expose an HTTP host and need silent reconnect.

## Considered options

- **New `connection` capability (rejected).** Liveness is not a role the product offers; stuffing it into the capability model invites every install concern to become a capability.
- **Reuse `/api/capabilities/invoke` with a sentinel (rejected).** Convenient but lies about the model.
- **Probe mutates config itself (rejected).** Opaque config interpretation stays in the connector; persistence stays in the core (`updateInstallation`).
- **Fail open on probe transport errors (rejected).** Would reintroduce enabled-but-dead after outages. Fail soft instead; only explicit `live: false` persists the probe's sanitized config suggestion (when provided) and forces reconnect.
- **Refresh repos/metadata on live reenable (deferred).** Mirror/reconcile already own freshness; keep this probe minimal.

## Consequences

- Narrowly extends ADR-0008: connect/OAuth URLs remain provider-specific, but **asking whether the external install still exists** is a generic framework question.
- Manifest gains an opt-in flag alongside capabilities/host metadata.
- Settings Enable for opted-in connectors gains a safe silent-reconnect path without trusting stale install ids.
