export function normalize(raw: string): string {
  return raw
    .replace(/^nummer\s*/i, "") // strip Dutch label prefix before removing other chars
    .replace(/^nr\s*/i, "")
    .replace(/[\s.\-]/g, "")
    .toLowerCase();
}
