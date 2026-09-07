import dotenv from "dotenv";
import { defineConfig, env } from "prisma/config";

dotenv.config({ path: "../../.env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "dotenv -e ../../.env -- tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
