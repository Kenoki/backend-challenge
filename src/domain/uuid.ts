const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Un id que no es UUID no puede existir en la base. Los repositorios lo usan para
 * devolver `null` en `findById` sin que Postgres falle por un `uuid` mal formado.
 */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
