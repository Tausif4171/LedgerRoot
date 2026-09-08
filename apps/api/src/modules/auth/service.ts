import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "../../infrastructure/database.js";
import { environment } from "../../config/env.js";
export function createAuth() {
  const env = environment();
  return betterAuth({
    database: prismaAdapter(db, { provider: "postgresql" }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_ORIGIN,
    trustedOrigins: [env.APP_ORIGIN],
    emailAndPassword: { enabled: true, disableSignUp: true },
    session: { cookieCache: { enabled: false } },
    advanced: { useSecureCookies: new URL(env.APP_ORIGIN).protocol === "https:" },
  });
}
