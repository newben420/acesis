export function normalizeName(str: string): string {
    return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\b(fc|cf|afc|sc|club|fk|ac)\b/g, "")
    .replace(/\s+/, " ")
    .trim();
}