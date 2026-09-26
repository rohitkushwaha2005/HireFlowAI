import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PipelineDto } from '@hireflow/shared';
import type * as ApiModule from '@/lib/api';
import { useMoveApplication } from './applications';
import { keys } from './keys';

const patchMock = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  patch: (...args: unknown[]) => patchMock(...args),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const card = {
  id: 'app-1',
  status: 'APPLIED' as const,
  appliedAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  candidate: { id: 'c1', firstName: 'Maya', lastName: 'Chen', headline: null },
  job: { id: 'j1', title: 'Engineer' },
  overallScore: 80,
  matchedSkills: [],
  interviewCount: 0,
};

const board = (): PipelineDto => ({
  columns: [
    { status: 'APPLIED', cards: [card], total: 1 },
    { status: 'SHORTLISTED', cards: [], total: 0 },
  ],
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(keys.applications.pipeline(undefined), board());
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useMoveApplication(), { wrapper });
  return { client, hook };
}

const columnIds = (client: QueryClient, status: string) =>
  client
    .getQueryData<PipelineDto>(keys.applications.pipeline(undefined))!
    .columns.find((c) => c.status === status)!
    .cards.map((c) => c.id);

describe('useMoveApplication (Kanban)', () => {
  beforeEach(() => {
    patchMock.mockReset();
  });

  it('moves the card optimistically before the server responds', async () => {
    let resolve!: (value: unknown) => void;
    patchMock.mockReturnValue(new Promise((r) => (resolve = r)));
    const { client, hook } = setup();

    act(() => hook.result.current.mutate({ id: 'app-1', from: 'APPLIED', to: 'SHORTLISTED' }));

    await waitFor(() => expect(columnIds(client, 'SHORTLISTED')).toEqual(['app-1']));
    expect(columnIds(client, 'APPLIED')).toEqual([]);
    expect(patchMock).toHaveBeenCalledWith('/applications/app-1/status', {
      status: 'SHORTLISTED',
      fromStatus: 'APPLIED',
    });
    resolve({});
  });

  it('rolls back when the server rejects the move', async () => {
    patchMock.mockImplementation(() => Promise.reject(new Error('Conflict')));
    const { client, hook } = setup();

    let failure: unknown = null;
    await act(async () => {
      await hook.result.current
        .mutateAsync({ id: 'app-1', from: 'APPLIED', to: 'SHORTLISTED' })
        .catch((e: unknown) => {
          failure = e;
        });
    });

    expect((failure as Error | null)?.message).toBe('Conflict');
    expect(patchMock).toHaveBeenCalledTimes(1);
    expect(columnIds(client, 'APPLIED')).toEqual(['app-1']);
    expect(columnIds(client, 'SHORTLISTED')).toEqual([]);
  });
});
