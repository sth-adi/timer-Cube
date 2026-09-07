export const FACE_NAMES = ["U", "R", "F", "D", "L", "B"] as const;

/** power: 0 = single CW turn, 1 = double (180), 2 = counter-CW (equivalent to 3x CW). */
export function moveLabel(face: number, power: 0 | 1 | 2): string {
  const suffix = power === 1 ? "2" : power === 2 ? "'" : "";
  return FACE_NAMES[face] + suffix;
}
