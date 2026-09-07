import { defineConfig } from "prisma/config";
import * as dotenv from "dotenv";
import path from "path";

// Manually load the .env file from the current directory
dotenv.config({ path: path.join(__dirname, ".env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url:
      process.env.DATABASE_URL
  },
});
