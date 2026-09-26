/**
 * Socket address unless the process is explicitly behind a trusted proxy.
 * Client-supplied X-Forwarded-For is ignored by default. When trusted, the
 * rightmost hop is the one a single appending proxy added.
 */
export function clientIpFromRequest(input: {
  socketIp?: string | null;
  forwardedFor?: string | null;
  trustProxy: boolean;
}): string | undefined {
  if (input.trustProxy && input.forwardedFor) {
    const parts = input.forwardedFor
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const chosen = parts[parts.length - 1];
    if (chosen) return chosen;
  }
  const socketIp = input.socketIp?.trim();
  return socketIp ? socketIp : undefined;
}

/** IPv4 CIDR match. Empty allowlist means allow all. Non-IPv4 is denied when a list is set. */
export function ipAllowed(ip: string | undefined, cidrs: string[]): boolean {
  if (!cidrs.length) return true;
  if (!ip) return false;
  const normalized = ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
  return cidrs.some((cidr) => ipv4InCidr(normalized, cidr));
}

function ipv4InCidr(ip: string, cidr: string): boolean {
  const [range, bitsRaw] = cidr.split("/");
  const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const ipNum = ipv4ToInt(ip);
  const rangeNum = ipv4ToInt(range ?? "");
  if (ipNum === null || rangeNum === null) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~0 << (32 - bits)) >>> 0;
  return (ipNum & mask) === (rangeNum & mask);
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    n = (n << 8) | octet;
  }
  return n >>> 0;
}

export function parsePgTextArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value !== "string" || value === "{}" || value.length === 0) return [];
  if (value.startsWith("{") && value.endsWith("}")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [value];
}

export class TokenBucket {
  private hits = new Map<string, number[]>();

  constructor(
    private capacity: number,
    private windowMs: number,
  ) {}

  allow(key: string, nowMs: number): boolean {
    const start = nowMs - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((ts) => ts > start);
    if (recent.length >= this.capacity) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(nowMs);
    this.hits.set(key, recent);
    return true;
  }
}
