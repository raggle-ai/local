export function quote(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}
