export function createStableUuid(): string {
  const c: Crypto | undefined = typeof crypto === "undefined" ? undefined : crypto;

  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }

  if (c && typeof c.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);

    // RFC 4122 v4
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
  }

  // Last resort: UUID-shaped value to satisfy server-side UUID validation.
  const tail = Date.now().toString(16).padStart(12, "0").slice(-12);
  return `00000000-0000-4000-8000-${tail}`;
}
