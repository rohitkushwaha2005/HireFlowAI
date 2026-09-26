import { z } from 'zod';

export const idSchema = z.string().trim().min(1).max(64);
export const idParamSchema = z.object({ id: idSchema });
export type IdParam = z.infer<typeof idParamSchema>;

export const SORT_ORDERS = ['asc', 'desc'] as const;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Optional trimmed string where "" becomes undefined — convenient for query strings and forms. */
export const optionalText = (max = 200) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(max).optional(),
  );

/** Nullable trimmed string where "" becomes null — for PATCH bodies that can clear a field. */
export const nullableText = (max = 200) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(max).nullable().optional(),
  );

export const nullableUrl = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z
    .url({ protocol: /^https?$/, error: 'Must be a valid http(s) URL' })
    .max(500)
    .nullable()
    .optional(),
);

/** Accepts `a,b,c` or repeated query params and yields a string array. */
export const csvArray = <T extends z.ZodType>(item: T) =>
  z.preprocess((v) => {
    if (v === undefined || v === null || v === '') return undefined;
    if (Array.isArray(v)) return v.flatMap((x) => String(x).split(',')).filter(Boolean);
    return String(v)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }, z.array(item).optional());

export const booleanQuery = z.preprocess((v) => {
  if (v === 'true' || v === '1' || v === true) return true;
  if (v === 'false' || v === '0' || v === false) return false;
  return undefined;
}, z.boolean().optional());
