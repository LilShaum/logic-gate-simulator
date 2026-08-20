/**
 * Simple id generator — no external deps needed.
 * Produces 8-char hex strings sufficient for a local editor.
 */
let counter = 0;

export const generateId = (): string => {
  counter += 1;
  const timePart = Date.now().toString(36);
  const randPart = Math.random().toString(36).slice(2, 6);
  return `${timePart}${randPart}${counter.toString(36)}`.slice(0, 12);
};
