import { PrismaClient } from "@prisma/client";
import "../config/env.js";
export const db = new PrismaClient();
