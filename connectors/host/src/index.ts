import dotenv from "dotenv";

import { createConnectorHost } from "./host";
import { linearConnector } from "./linear";

dotenv.config({ path: [".env.local", ".env"] });

const port = Number.parseInt(process.env.PORT ?? "3336", 10);
const app = createConnectorHost({
  connectors: [linearConnector],
  secret: process.env.DISCORD_BOT_KEY,
}).listen(port);

console.log(`Connector host listening on port ${port}`);

export type App = typeof app;
