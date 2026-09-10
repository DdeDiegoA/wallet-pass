// Sanitizacion basica (control chars + longitud). Validacion tipada por
// passType es Fase 3, ver PRD.md seccion 9.3.
export function sanitizeText(input: string, maxLen = 500): string {
  return input.replace(/[\x00-\x1F\x7F]/g, "").slice(0, maxLen);
}
