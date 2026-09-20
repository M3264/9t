export const LIFETIME_MS = {
  "1h": 36e5,
  "1d": 864e5,
  "7d": 6048e5,
  "30d": 2592e6,
} as const;

export type Lifetime = keyof typeof LIFETIME_MS | "forever";

export function expiryFromLifetime(
  lifetime: string | null | undefined,
  fallback: Lifetime = "1d",
): string | undefined {
  if (!lifetime || lifetime === "forever") return undefined;
  const ms =
    LIFETIME_MS[lifetime as keyof typeof LIFETIME_MS] ??
    LIFETIME_MS[fallback as keyof typeof LIFETIME_MS];
  if (!ms) return undefined;
  return new Date(Date.now() + ms).toISOString();
}
