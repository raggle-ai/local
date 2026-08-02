export function buildLuckyUrl(query: string): string {
  const searchParams = new URLSearchParams({
    q: query.trim(),
    btnI: "1",
  });

  return `https://www.google.com/search?${searchParams.toString()}`;
}
