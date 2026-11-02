import bcrypt from "bcryptjs";

// Cost factor 12 = 2^12 rounds: slow enough to resist brute force, fast enough for a login.
const BCRYPT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// A real bcrypt hash of a random string. Comparing against it when the email does
// not exist makes "wrong email" and "wrong password" take the same time, so
// attackers cannot discover which emails are registered.
export const DUMMY_HASH = "$2b$12$raEFZN/5M5qwUZG6ByL5gepEccU0O6kJjfSE8K1prfXPm1JLN7jBK";
