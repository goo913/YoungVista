/** A new design item id: short, unique enough for one room, and safe in Firestore. */
export function newItemId(
  random: () => number = Math.random,
  now: () => number = Date.now,
): string {
  const rand = Math.floor(random() * 36 ** 6)
    .toString(36)
    .padStart(6, '0');
  return `i${now().toString(36)}${rand}`;
}
