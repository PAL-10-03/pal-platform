import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE = "pal_session";
const MAX_AGE_SECONDS = 60 * 60 * 12;

function secret() {
  return process.env.PAL_SESSION_SECRET || "pal-prototype-session-secret-change-me";
}

export type Session = {
  userId: string;
  email: string;
  name: string;
  isPalAdmin: boolean;
  tenantId: string | null;
  tenantName: string | null;
  role: "employee" | "manager" | null;
  exp: number;
};

export function signSession(session: Omit<Session, "exp">): string {
  const payload: Session = { ...session, exp: Date.now() + MAX_AGE_SECONDS * 1000 };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readSession(): Session | null {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const session = JSON.parse(Buffer.from(body, "base64url").toString()) as Session;
  if (session.exp < Date.now()) return null;
  return session;
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 32);
  const prev = Buffer.from(hash, "hex");
  if (next.length !== prev.length) return false;
  return timingSafeEqual(next, prev);
}

export const cookieName = SESSION_COOKIE;
export const cookieMaxAge = MAX_AGE_SECONDS;
