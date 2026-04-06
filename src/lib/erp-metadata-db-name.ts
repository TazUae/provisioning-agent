/**
 * MariaDB schema name from ERP execution success metadata.
 * Prefer `db_name` (Frappe/executor canonical); fall back to `dbName` for legacy responses.
 */
function normalizeMetadataDbValue(
  raw: string | number | boolean | undefined
): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const s =
    typeof raw === "string"
      ? raw.trim()
      : typeof raw === "number" || typeof raw === "boolean"
        ? String(raw).trim()
        : "";
  return s !== "" ? s : undefined;
}

export function extractDbNameFromMetadata(
  metadata?: Record<string, string | number | boolean>
): string | undefined {
  if (!metadata) {
    return undefined;
  }
  const fromSnake = normalizeMetadataDbValue(metadata.db_name);
  if (fromSnake) {
    return fromSnake;
  }
  return normalizeMetadataDbValue(metadata.dbName);
}
