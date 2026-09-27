export type MappingSeedRow = {
  provider: "stripe" | "polar";
  event_type: string;
  actions: string[];
  enabled: boolean;
  product_or_price_id: string | null;
  revoke_on_past_due: boolean;
};

/**
 * Tiny YAML subset for the founding seed file.
 * DB rows win: the loader inserts missing keys and does not overwrite.
 */
export function parseMappingSeed(source: string): MappingSeedRow[] {
  const rows: MappingSeedRow[] = [];
  let current: Partial<MappingSeedRow> | null = null;
  const flush = () => {
    if (!current) return;
    if (current.provider !== "stripe" && current.provider !== "polar") {
      throw new Error("mapping seed row missing provider");
    }
    if (!current.event_type) throw new Error("mapping seed row missing event_type");
    rows.push({
      provider: current.provider,
      event_type: current.event_type,
      actions: current.actions ?? [],
      enabled: current.enabled ?? true,
      product_or_price_id: current.product_or_price_id ?? null,
      revoke_on_past_due: current.revoke_on_past_due ?? false,
    });
    current = null;
  };

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trimEnd();
    if (!line.trim() || line.trim() === "mappings:") continue;
    if (line.trim() === "-") {
      flush();
      current = {};
      continue;
    }
    const item = line.trim();
    if (item.startsWith("- ")) {
      flush();
      current = {};
      const rest = item.slice(2).trim();
      if (rest) assignField(current, rest);
      continue;
    }
    if (!current) continue;
    assignField(current, item);
  }
  flush();
  return rows;
}

function assignField(row: Partial<MappingSeedRow>, text: string): void {
  const idx = text.indexOf(":");
  if (idx < 0) return;
  const key = text.slice(0, idx).trim();
  const value = text.slice(idx + 1).trim();
  if (key === "provider") {
    if (value === "stripe" || value === "polar") row.provider = value;
    return;
  }
  if (key === "event_type") {
    row.event_type = unquote(value);
    return;
  }
  if (key === "enabled") {
    row.enabled = value === "true";
    return;
  }
  if (key === "revoke_on_past_due") {
    row.revoke_on_past_due = value === "true";
    return;
  }
  if (key === "product_or_price_id") {
    row.product_or_price_id = value === "null" || value === "" ? null : unquote(value);
    return;
  }
  if (key === "actions") {
    row.actions = parseActions(value);
  }
}

function parseActions(value: string): string[] {
  const inner = value.replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!inner) return [];
  return inner
    .split(",")
    .map((part) => unquote(part.trim()))
    .filter(Boolean);
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
