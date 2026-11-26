// Signed tokens (student session cookie, activity start tickets), IP hashing, link tokens.
// Uses Node crypto only. Never import this from client components.
import { createHmac, randomBytes, timingSafeEqual, createHash } from "node:crypto";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set (32+ chars)");
    return "dev-only-insecure-session-secret-change-me-please";
  }
  return s;
}

const b64u = (b: Buffer) => b.toString("base64url");

/** Signs a JSON payload: base64url(json).base64url(hmac-sha256). */
export function sign(kind: string, payload: object, key = secret()): string {
  const body = b64u(Buffer.from(JSON.stringify(payload)));
  const mac = createHmac("sha256", key).update(`${kind}.${body}`).digest();
  return `${body}.${b64u(mac)}`;
}

/** Verifies a token from `sign`. Returns null when the signature or format is wrong. */
export function verify<T>(kind: string, token: string | undefined | null, key = secret()): T | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), "base64url");
  const want = createHmac("sha256", key).update(`${kind}.${body}`).digest();
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export type StudentSession = { c: string; w: string; i: string; exp: number };

export const SESSION_COOKIE = "sap_session";

export function signSession(s: StudentSession): string {
  return sign("session", s);
}

export function verifySession(token: string | undefined, now = Date.now()): StudentSession | null {
  const s = verify<StudentSession>("session", token);
  if (!s || typeof s.exp !== "number" || s.exp <= now) return null;
  if (typeof s.c !== "string" || typeof s.w !== "string" || typeof s.i !== "string") return null;
  return s;
}

/** Issued when an activity starts; returned on submit so the attempt number and start time are trusted. */
export type StartTicket = { a: string; i: string; n: number; s: number };

export const signTicket = (t: StartTicket) => sign("ticket", t);
export const verifyTicket = (t: string | undefined) => verify<StartTicket>("ticket", t);

/** Salted SHA-256 of an IP address (SRS 4: IPs stored as salted hashes). */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const salt = process.env.IP_HASH_SALT || secret();
  return createHash("sha256").update(`${salt}|${ip}`).digest("base64url").slice(0, 32);
}

const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A random, unguessable link token (SRS 6.1: 12 characters). Rejection sampling avoids bias. */
export function randomToken(len = 12): string {
  let out = "";
  while (out.length < len) {
    for (const byte of randomBytes(len * 2)) {
      if (byte < 256 - (256 % ALPHABET.length)) out += ALPHABET[byte % ALPHABET.length];
      if (out.length === len) break;
    }
  }
  return out;
}
