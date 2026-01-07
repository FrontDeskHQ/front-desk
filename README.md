<div align="center">

# FrontDesk

[![License: AGPL](https://img.shields.io/badge/License-AGPL-brightgreen.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/frontdeskhq/front-desk/pulls)

**The all-in-one customer support platform.** Making good customer support extremely easy.



**[Website](https://tryfrontdesk.app)**
<span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
**[Discord Community](https://discord.gg/5MDHqKHrHr)**
<span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
**[Documentation](https://tryfrontdesk.app/docs)**

<a href="https://twitter.com/intent/follow?screen_name=frontdeskhq">
    <img src="https://img.shields.io/twitter/follow/frontdeskhq.svg?label=Follow%20@frontdeskhq" alt="Follow @frontdeskhq" />
</a>

</div>

---

FrontDesk is an open-source customer support platform designed to help you assist your customers wherever they are. Built with design as a first-class citizen, it provides a seamless and lightning-fast experience for both support teams and customers.

## Features

- **Beautiful, Modern UI** - Thoughtfully designed interface built with TailwindCSS and shadcn/ui
- **Lightning Fast** - Built on TanStack Start for optimal performance
- **Real-time Updates** - Live state synchronization for instant updates
- **Multi-channel Support** - Connect with customers via Discord and more
- **Multi-tenant** - Support multiple organizations with subdomain routing
- **Secure Authentication** - Built-in auth with Better Auth
- **Responsive Design** - Works seamlessly across all devices
- **Developer Friendly** - TypeScript, modern tooling, and excellent DX

## Getting Started

### Prerequisites

- **Node.js** 18 or higher
- **bun** (package manager)
- **Docker** (for local development with database)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/frontdeskhq/front-desk.git
   cd front-desk
   ```

2. **Install dependencies:**
   ```bash
   bun install
   ```

3. **Set up environment variables:**
   ```bash
   cp apps/api/.env.local.example apps/api/.env.local
   ```
   Update the environment variables in `apps/api/.env.local` with your configuration.

4. **Start the development servers:**
   ```bash
   bun dev
   ```

   This will start:
   - Frontend web app (typically on `http://localhost:3000`)
   - Backend API server (typically on `http://localhost:3333`)
   - Discord bot (if configured)

## Project Structure

This project uses a **monorepo** structure powered by [Turborepo](https://turbo.build/) and bun workspaces.

```
front-desk/
├── apps/
│   ├── api/              # Backend API (Express + live-state)
│   ├── discord/          # Discord bot integration
│   ├── waitlist/         # Waitlist landing page
│   └── web/              # Frontend application (TanStack Start)
├── packages/
│   ├── emails/           # Email templates
│   ├── schemas/          # Shared Zod schemas
│   └── ui/               # Shared UI components (shadcn/ui)
└── docker-compose.yaml   # Local development setup
```

### Key Technologies

- **Frontend:** TanStack Start, React, TypeScript, TailwindCSS
- **Backend:** Express, live-state, Better Auth
- **Database:** PostgreSQL
- **Styling:** TailwindCSS, shadcn/ui
- **Build Tool:** Vite, Turborepo
- **Package Manager:** bun

## Contributing

We welcome contributions! Whether you're fixing bugs, adding features, or improving documentation, your help makes FrontDesk better for everyone.


![Alt](https://repobeats.axiom.co/api/embed/7ba3fc4ab9db1a9015cc6349fe428efe4289a3f4.svg "Repobeats analytics image")

### How to Contribute

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feat/amazing-feature`)
3. **Make your changes** and ensure code follows project standards
4. **Commit your changes** (`git commit -m 'feat: Add amazing feature'`)
5. **Push to your branch** (`git push origin feat/amazing-feature`)
6. **Open a Pull Request**

### Development Guidelines

- Follow the existing code style and conventions
- Write clear commit messages following [Conventional Commits](https://www.conventionalcommits.org/)
- Add tests for new features when applicable
- Update documentation as needed

> **Note:** We're working on a comprehensive contributing guide. In the meantime, feel free to open an issue or reach out on Discord if you have questions!

## License

This project is licensed under the **AGPL License** - see the [LICENSE](LICENSE) file for details.

---

**Made with love by the FrontDesk team**

[Website](https://tryfrontdesk.app) • [Discord](https://discord.gg/5MDHqKHrHr) • [GitHub](https://github.com/frontdeskhq/front-desk)
