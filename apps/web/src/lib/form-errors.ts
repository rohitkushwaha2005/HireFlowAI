import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api';

/** Maps API validation issues onto react-hook-form fields. Returns true when any were applied. */
export function applyServerErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>): boolean {
  if (!(error instanceof ApiError)) return false;
  const fields = Object.entries(error.fieldErrors);
  for (const [path, message] of fields) setError(path as Path<T>, { type: 'server', message });
  return fields.length > 0;
}
