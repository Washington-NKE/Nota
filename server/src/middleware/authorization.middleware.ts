import type { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { prisma } from "../config/prisma";

type RequiredRole = "analyst" | "admin";

export function requireRole(...roles: RequiredRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { userId, sessionClaims } = getAuth(req);
    if (!userId) {
      res.status(401).json({ message: "Authentication required." });
      return;
    }

    const claims = sessionClaims as {
      metadata?: { role?: string };
      publicMetadata?: { role?: string };
    } | undefined;
    const claimedRole =
      claims?.metadata?.role ?? claims?.publicMetadata?.role;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    const role = user?.role === "admin"
      ? "admin"
      : user?.role === "analyst"
        ? "analyst"
        : claimedRole;

    if (role === "admin" || (role && roles.includes(role as RequiredRole))) {
      next();
      return;
    }

    res.status(403).json({ message: "Analyst or administrator permission required." });
  };
}
