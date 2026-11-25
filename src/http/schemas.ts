import { z } from 'zod';

/** Fecha ISO 8601 con zona obligatoria ('Z' u offset); se transforma a Date. */
export const isoDateTimeWithZone = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
