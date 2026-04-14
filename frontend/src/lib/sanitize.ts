/**
 * Strip ASCII control characters (null bytes, escape sequences, etc.)
 * from any text input. Keeps all printable characters including Unicode.
 */
export function sanitizeText(value: string): string {
  // Remove C0 control chars (0x00–0x1F) except tab (0x09), and DEL (0x7F)
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

/**
 * Sanitize an email field: strip control chars, trim whitespace, lowercase.
 * Browsers validate the format; this ensures no accidental spaces slip through.
 */
export function sanitizeEmail(value: string): string {
  return sanitizeText(value).trim().toLowerCase()
}
