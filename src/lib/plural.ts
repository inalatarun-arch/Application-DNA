/** `plural(1, 'module')` -> "1 module"; `plural(3, 'module')` -> "3 modules". Pass `many` for irregular plurals. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
