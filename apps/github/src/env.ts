import dotenv from "dotenv";

dotenv.config({ path: [".env.local", ".env"] });

// Define required environment variables
const envVars = ["GITHUB_WEBHOOK_SECRET"];

for (const varName of envVars) {
  if (!process.env[varName]) console.log(`${varName} not set`);
}
