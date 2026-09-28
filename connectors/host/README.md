# Connector host

The connector host owns provider-facing OAuth, webhooks, synchronization, and
capability calls. Core services communicate with it over the shared
`DISCORD_BOT_KEY`; provider credentials never enter browser-visible state.

## Linear

Create a Linear OAuth application with app actor authorization and grant only
`read` and `issues:create`. Configure these URLs for a local host on port 3336:

- OAuth callback: `http://localhost:3336/linear/authorization/callback`
- Webhook: `http://localhost:3336/linear/api/webhook`
- Webhook resource types: `Issue` and `OAuthApp`

Copy `connectors/host/.env.local.example` to `connectors/host/.env.local` and set
the connector-host variables there. The web app needs no Linear settings: it
asks the API for the authorization URL, which the connector host builds. The API also requires `INTEGRATION_CREDENTIAL_CURRENT_KEY_ID` and
`INTEGRATION_CREDENTIAL_KEYS`; the latter is a JSON map whose values are
base64-encoded 32-byte AES keys. Keep both the keyring and the Linear client
secret server-side.

The `linear-integration` Reflag flag controls whether the settings surface is
shown. Disabling an integration stops actions and inbound observation.
Disconnecting revokes the Linear token, clears the encrypted local credential,
and removes mirrored Linear issues from discovery while retaining historical
thread links.
