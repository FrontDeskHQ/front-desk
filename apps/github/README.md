# GitHub App

A GitHub integration service for Front Desk that handles GitHub Pull Requests and Issues via webhooks.

## Features

- **Issues Integration**: Automatically create threads in Front Desk when new GitHub issues are opened
- **Pull Requests Integration**: Track PR discussions and comments as threads
- **Real-time Sync**: Uses Live State to sync data with the main API
- **Comment Tracking**: Captures issue comments and PR review comments

## Setup

### Environment Variables

Create a `.env.local` file with the following variables:

```env
# GitHub App Configuration
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
GITHUB_BOT_KEY=your_bot_api_key_here

# Live State Connection
LIVE_STATE_WS_URL=ws://localhost:3333/api/ls/ws
LIVE_STATE_API_URL=http://localhost:3333/api/ls

# Server Configuration
PORT=3334
```

### GitHub App Configuration

1. Create a GitHub App at https://github.com/settings/apps/new
2. Set the webhook URL to: `https://your-domain.com/webhooks/github`
3. Set the webhook secret (same as `GITHUB_WEBHOOK_SECRET` above)
4. Subscribe to these events:
   - Issues (opened, edited, closed)
   - Issue comments (created)
   - Pull requests (opened, edited, closed)
   - Pull request review comments (created)

### Integration Settings

The integration settings stored in the database should follow this schema:

```json
{
  "installationId": "12345678",
  "repositoryOwner": "FrontDeskHQ",
  "repositoryName": "front-desk",
  "webhookSecret": "optional-override-secret",
  "selectedEvents": ["issues", "pull_request"]
}
```

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode (with auto-reload)
pnpm dev

# Build for production
pnpm build

# Run in production
pnpm start

# Type checking
pnpm typecheck

# Linting
pnpm lint
pnpm lint:fix
```

## How It Works

1. **Webhook Reception**: The app listens for GitHub webhooks on an HTTP server
2. **Event Processing**: When issues or PRs are opened/commented on, the app:
   - Finds the matching integration configuration
   - Creates or retrieves the author from the database
   - Creates a thread for new issues/PRs
   - Adds messages for comments
3. **Data Sync**: All data is synced through Live State to the main API

## Thread Mapping

- **GitHub Issues** → Front Desk Threads with `githubIssueNumber` and `githubIssueUrl`
- **GitHub PRs** → Front Desk Threads with `githubPrNumber` and `githubPrUrl`
- **Comments** → Front Desk Messages with `origin: "github"`

## Health Check

The app exposes a health check endpoint at `/health` that returns:

```json
{
  "status": "ok"
}
```

## Deployment

The app is configured for deployment on Railway with the included `railway.json` configuration.

```bash
# Build command
pnpm build -F github...

# Start command
pnpm --filter github start
```

## Architecture

Similar to the Discord app, this GitHub app:
- Runs as a standalone service
- Connects to the main API via Live State
- Processes webhooks independently
- Maintains its own webhook server
