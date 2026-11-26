// Inline comments follow Docker Compose env_file rules (whitespace then #). Pass
// stripInlineComments: false to keep values whole.
export function parseEnvFile(content, { stripInlineComments = true } = {}) {
  let text = content;
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const commentIndex = stripInlineComments ? rawValue.search(/\s+#/) : -1;
    values[key] = commentIndex === -1 ? rawValue : rawValue.slice(0, commentIndex).trim();
  }

  return values;
}

export function parsePostgresDatabaseUrl(databaseUrl) {
  try {
    const normalized = databaseUrl.replace(/^postgresql:/, "http:").replace(/^postgres:/, "http:");
    const parsed = new URL(normalized);
    const databaseName = parsed.pathname.replace(/^\//, "");
    if (!parsed.hostname || !databaseName) {
      return null;
    }

    return {
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      host: parsed.hostname,
      port: parsed.port || "5432",
      database: databaseName,
    };
  } catch {
    return null;
  }
}
