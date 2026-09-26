import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

/**
 * Stores list state (filters, search, page) in the URL so views are shareable and survive reloads.
 * Arrays are stored comma-separated. Changing any filter resets the page to 1.
 */
export function useSearchParamsState<T extends Record<string, string | string[] | number | undefined>>(defaults: T) {
  const [params, setParams] = useSearchParams();

  const state = useMemo(() => {
    const result: Record<string, unknown> = { ...defaults };
    for (const [key, fallback] of Object.entries(defaults)) {
      const raw = params.get(key);
      if (raw === null) continue;
      if (Array.isArray(fallback)) result[key] = raw ? raw.split(',') : [];
      else if (typeof fallback === 'number') result[key] = Number(raw) || fallback;
      else result[key] = raw;
    }
    return result as T;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const update = useCallback(
    (patch: Partial<T>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
            if (empty || value === defaults[key]) next.delete(key);
            else next.set(key, Array.isArray(value) ? value.join(',') : String(value));
          }
          if (!('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [defaults, setParams],
  );

  return [state, update] as const;
}
