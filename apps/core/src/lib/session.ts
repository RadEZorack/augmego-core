import type { PrismaClient } from "@prisma/client";
import { parseCookies } from "./cookies.js";

export type SessionUser = {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  playerAvatarStationaryModelUrl?: string | null;
  playerAvatarMoveModelUrl?: string | null;
  playerAvatarSpecialModelUrl?: string | null;
};

export async function resolveSessionUser(
  prisma: PrismaClient,
  request: Request,
  sessionCookieName: string
): Promise<SessionUser | null> {
  const cookies = parseCookies(request.headers.get("cookie"));
  const sessionId = cookies[sessionCookieName];
  if (!sessionId) return null;

  const session = await prisma.session.findFirst({
    where: {
      id: sessionId,
      revokedAt: null,
      expiresAt: { gt: new Date() }
    },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true
        }
      }
    }
  });

  if (!session) return null;

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    avatarUrl: session.user.avatarUrl
  };
}
