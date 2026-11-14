/**
 * Lua scripts for atomic OTP operations in Redis.
 *
 * These scripts ensure atomicity for rate limiting, challenge lifecycle,
 * and verification — eliminating TOCTOU races across multiple API instances.
 *
 * All scripts use `redis.call()` (not `redis.pcall()`) so errors propagate
 * to the caller for proper handling.
 *
 * Usage: `redis.client.eval(SCRIPT, numKeys, ...keys, ...args)`
 */

/**
 * ACQUIRE_RATE_LIMIT — Atomically check-and-increment a rate-limit counter.
 *
 * Used for both OTP-request limits (`otp:req:{phone}`) and
 * verification-failure limits (`otp:vatt:{phone}`).
 *
 * KEYS[1] = rate-limit key
 * ARGV[1] = maxAttempts (integer)
 * ARGV[2] = windowSec   (TTL in seconds)
 *
 * Returns: { allowed (1|0), count (integer), ttl (integer) }
 *
 * Atomicity guarantee: Redis executes Lua scripts atomically — no other
 * command runs between GET and INCR. This eliminates the TOCTOU race
 * where concurrent requests all read the same count before any increment.
 */
export const ACQUIRE_RATE_LIMIT = `
local key = KEYS[1]
local maxAttempts = tonumber(ARGV[1])
local windowSec = tonumber(ARGV[2])

local current = redis.call('GET', key)
local count = current and tonumber(current) or 0

if count >= maxAttempts then
  local ttl = redis.call('TTL', key)
  if ttl < 0 then ttl = windowSec end
  return { 0, count, ttl }
end

count = redis.call('INCR', key)
if count == 1 then
  redis.call('EXPIRE', key, windowSec)
end

local ttl = redis.call('TTL', key)
if ttl < 0 then
  redis.call('EXPIRE', key, windowSec)
  ttl = windowSec
end

local remaining = maxAttempts - count
if remaining < 0 then remaining = 0 end

return { 1, count, ttl }
`;

/**
 * CREATE_CHALLENGE — Atomically create or supersede an OTP challenge.
 *
 * Always overwrites any existing challenge (single-active-challenge policy).
 * The caller is responsible for rate-limit checks before invoking this script.
 *
 * KEYS[1] = otp:{phone}
 * ARGV[1] = challengeId (UUID)
 * ARGV[2] = otpHash     (HMAC-SHA256 hex)
 * ARGV[3] = salt        (hex)
 * ARGV[4] = expirySec   (integer, e.g. 90)
 * ARGV[5] = createdAt   (epoch ms as string)
 *
 * Returns: { 1 } on success (always succeeds — supersedes existing).
 */
export const CREATE_CHALLENGE = `
local key = KEYS[1]
local challengeId = ARGV[1]
local otpHash = ARGV[2]
local salt = ARGV[3]
local expirySec = tonumber(ARGV[4])
local createdAt = ARGV[5]

local challenge = cjson.encode({
  ch = challengeId,
  hs = otpHash,
  s = salt,
  ca = createdAt,
  co = false
})

redis.call('SET', key, challenge, 'EX', expirySec)

return { 1 }
`;

/**
 * CLEANUP_CHALLENGE — Atomically delete a challenge only if the caller
 * owns it (challengeId matches). Prevents a stale failed delivery from
 * removing a newer challenge.
 *
 * KEYS[1] = otp:{phone}
 * ARGV[1] = challengeId (the caller's challenge ID)
 *
 * Returns: { deleted (1|0) }
 */
export const CLEANUP_CHALLENGE = `
local key = KEYS[1]
local challengeId = ARGV[1]

local raw = redis.call('GET', key)
if not raw then
  return { 0 }
end

local challenge = cjson.decode(raw)
if challenge.ch == challengeId then
  redis.call('DEL', key)
  return { 1 }
end

-- Challenge belongs to a different (newer) request — do not delete
return { 0 }
`;

/**
 * VERIFY_AND_CONSUME — Atomically verify an OTP hash and consume the challenge.
 *
 * The comparison uses Lua's `~=` on the stored and provided HMAC-SHA256 hex
 * digests. This is NOT a constant-time primitive: Lua may short-circuit on the
 * first differing byte. That is acceptable here because the secret compared is
 * an HMAC digest of a short-lived 6-digit code (not the code itself), the
 * comparison runs server-side inside Redis, and verification is bounded by the
 * `otp:vatt` rate-limit — an attacker cannot use response timing to recover a
 * usable code within the attempt/TTL budget. Do not describe this as
 * constant-time; if a true constant-time guarantee is ever required, replace it
 * with a scripted constant-time digest comparison and re-verify.
 *
 * KEYS[1] = otp:{phone}
 * ARGV[1] = providedHash (HMAC-SHA256 hex of user-supplied OTP + salt)
 *
 * Returns: { status }
 *   1  = valid OTP — challenge consumed (key deleted)
 *   0  = invalid OTP (hash mismatch)
 *  -1  = no challenge found (expired or never created)
 *  -2  = challenge already consumed (replay attempt)
 */
export const VERIFY_AND_CONSUME = `
local key = KEYS[1]
local providedHash = ARGV[1]

local raw = redis.call('GET', key)
if not raw then
  return { -1 }
end

local challenge = cjson.decode(raw)

if challenge.co then
  return { -2 }
end

if challenge.hs ~= providedHash then
  return { 0 }
end

-- Valid OTP — consume by deleting the challenge
redis.call('DEL', key)
return { 1 }
`;
