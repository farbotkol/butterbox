type PageError = { code: string; message: string };
type Page<T> = { data: T[] | null; error: PageError | null; count: number | null };

export function parsePageNumber(value: unknown): number | null {
  if (value === undefined) return 1;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= 100_000 ? page : null;
}

export async function readAllPages<T>(
  readPage: (from: number, to: number) => PromiseLike<Page<T>>,
  key: (row: T) => string,
): Promise<{ data: T[] | null; error: PageError | null }> {
  const rows: T[] = [];
  const seen = new Set<string>();
  let total: number | undefined;
  for (;;) {
    const page = await readPage(rows.length, rows.length + 999);
    if (page.error) return { data: null, error: page.error };
    if (page.data === null || page.count === null) {
      return {
        data: null,
        error: { code: "incomplete_result", message: "The query did not return a complete row count." },
      };
    }
    if (total !== undefined && page.count !== total) {
      return {
        data: null,
        error: { code: "incomplete_result", message: "Rows changed while the query was loading." },
      };
    }
    total = page.count;
    for (const row of page.data) {
      const id = key(row);
      if (seen.has(id)) {
        return {
          data: null,
          error: { code: "incomplete_result", message: "The query returned a duplicate row." },
        };
      }
      seen.add(id);
      rows.push(row);
    }
    if (rows.length > total) {
      return {
        data: null,
        error: { code: "incomplete_result", message: "The query returned more rows than expected." },
      };
    }
    if (rows.length === total) return { data: rows, error: null };
    if (page.data.length === 0) {
      return {
        data: null,
        error: { code: "incomplete_result", message: "The query ended before all rows were loaded." },
      };
    }
  }
}
