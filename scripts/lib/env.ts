// Load `.env` for command-line scripts (Next.js loads it on its own for the app).
import { config } from "dotenv";

config({ path: ".env", quiet: true });

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing environment variable ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}
