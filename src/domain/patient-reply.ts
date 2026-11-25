export type ReplyIntent = 'confirm' | 'cancel';

/**
 * Interpreta el texto de una respuesta del paciente: normaliza (NFD, sin diacríticos, minúsculas),
 * recorta lo que no sea letra o número en los extremos y compara con `si` / `no`. Cualquier otro texto es `null`.
 */
export function parseReply(text: string): ReplyIntent | null {
  const word = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  if (word === 'si') return 'confirm';
  if (word === 'no') return 'cancel';
  return null;
}
