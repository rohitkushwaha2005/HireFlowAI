import { describe, expect, it } from 'vitest';
import type { JobAnalysis } from '@hireflow/shared';
import { AIUnavailableError } from '../lib/errors';
import { createLogger } from '../lib/logger';
import { AnthropicProvider } from './anthropic-provider';
import type { CopilotToolbox } from './copilot/toolbox';

/**
 * Exercises the Claude provider through the real Anthropic SDK with a stubbed transport:
 * request construction, structured-output parsing, re-validation, stop-reason handling and the
 * copilot tool loop. No network access or API key is needed.
 */

const logger = createLogger({ logLevel: 'silent', isProduction: false, isTest: true });

type Captured = { url: string; body: Record<string, unknown> };

function stubFetch(responses: Array<Record<string, unknown> | { status: number; body: unknown }>) {
  const calls: Captured[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> });
    const next = responses.shift();
    if (!next) throw new Error('No stubbed response left');
    const isError = 'status' in next && typeof next.status === 'number' && next.status >= 400;
    return new Response(JSON.stringify(isError ? (next as { body: unknown }).body : next), {
      status: isError ? (next as { status: number }).status : 200,
      headers: { 'content-type': 'application/json', 'request-id': 'req_test' },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function message(content: unknown[], stopReason = 'end_turn') {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5',
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

const ANALYSIS: JobAnalysis = {
  summary: 'Build real-time collaboration features.',
  requiredSkills: [{ skill: 'React', category: 'FRAMEWORK', weight: 5, minimumYears: 3 }],
  preferredSkills: [{ skill: 'AWS', category: 'CLOUD', weight: 2, minimumYears: null }],
  minYearsExperience: 3,
  educationLevel: 'BACHELOR',
  responsibilities: ['Ship features'],
  keywords: ['React'],
  seniority: 'MID',
  location: null,
  employmentType: 'FULL_TIME',
  remoteType: 'REMOTE',
};

describe('AnthropicProvider', () => {
  it('requests structured output with adaptive thinking and the refusal fallback, and parses the result', async () => {
    const { fetchImpl, calls } = stubFetch([message([{ type: 'text', text: JSON.stringify(ANALYSIS) }])]);
    const provider = new AnthropicProvider('sk-test', 'claude-opus-5', logger, { fetch: fetchImpl, maxRetries: 0 });

    const result = await provider.analyzeJob({ title: 'Full Stack Engineer', description: 'We need React.' });

    expect(result).toEqual(ANALYSIS);
    const body = calls[0]!.body;
    expect(calls[0]!.url).toContain('/v1/messages');
    expect(body.model).toBe('claude-opus-5');
    expect(body.thinking).toEqual({ type: 'adaptive' });
    expect(body.fallbacks).toBe('default');
    const outputConfig = body.output_config as { effort: string; format: { type: string; schema: { properties: object } } };
    expect(outputConfig.effort).toBe('low');
    expect(outputConfig.format.type).toBe('json_schema');
    expect(Object.keys(outputConfig.format.schema.properties)).toEqual(expect.arrayContaining(['requiredSkills', 'preferredSkills']));
    expect(JSON.stringify(body.messages)).toContain('We need React.');
  });

  it('rejects output that does not match the schema', async () => {
    const { fetchImpl } = stubFetch([message([{ type: 'text', text: JSON.stringify({ summary: 'x' }) }])]);
    const provider = new AnthropicProvider('sk-test', 'claude-opus-5', logger, { fetch: fetchImpl, maxRetries: 0 });
    await expect(provider.analyzeJob({ title: 'T', description: 'D' })).rejects.toBeInstanceOf(AIUnavailableError);
  });

  it('treats refusals and truncation as unavailable instead of parsing partial output', async () => {
    const { fetchImpl } = stubFetch([
      message([{ type: 'text', text: '' }], 'refusal'),
      message([{ type: 'text', text: '{"summary": "tru' }], 'max_tokens'),
    ]);
    const provider = new AnthropicProvider('sk-test', 'claude-opus-5', logger, { fetch: fetchImpl, maxRetries: 0 });
    await expect(provider.analyzeJob({ title: 'T', description: 'D' })).rejects.toThrow(/declined/);
    await expect(provider.analyzeJob({ title: 'T', description: 'D' })).rejects.toThrow(/truncated/);
  });

  it('maps API errors to AIUnavailableError', async () => {
    const { fetchImpl } = stubFetch([{ status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'bad key' } } }]);
    const provider = new AnthropicProvider('sk-test', 'claude-opus-5', logger, { fetch: fetchImpl, maxRetries: 0 });
    await expect(provider.analyzeJob({ title: 'T', description: 'D' })).rejects.toThrow(/credentials/);
  });

  it('omits the server-side fallback for models that do not support it', async () => {
    const { fetchImpl, calls } = stubFetch([message([{ type: 'text', text: JSON.stringify(ANALYSIS) }])]);
    const provider = new AnthropicProvider('sk-test', 'claude-sonnet-5', logger, { fetch: fetchImpl, maxRetries: 0 });
    await provider.analyzeJob({ title: 'T', description: 'D' });
    expect(calls[0]!.body.fallbacks).toBeUndefined();
  });

  it('runs the copilot tool loop, validates tool input and returns the final answer', async () => {
    const { fetchImpl, calls } = stubFetch([
      message(
        [
          { type: 'tool_use', id: 'toolu_1', name: 'find_candidates_by_skills', input: { skills: ['React', 'Node.js'] } },
          { type: 'tool_use', id: 'toolu_2', name: 'find_candidates_by_skills', input: { skills: [] } },
        ],
        'tool_use',
      ),
      message([{ type: 'text', text: '**Maya Chen** has 5 years of React.' }]),
    ]);
    const executed: unknown[] = [];
    const toolbox: CopilotToolbox = {
      execute: async (name, input) => {
        executed.push({ name, input });
        return [{ candidateId: 'c1', name: 'Maya Chen' }];
      },
      retrieved: () => [],
      used: () => ['find_candidates_by_skills'],
    };
    const provider = new AnthropicProvider('sk-test', 'claude-opus-5', logger, { fetch: fetchImpl, maxRetries: 0 });

    const answer = await provider.answerHiringQuestion({ question: 'Who knows React?', history: [], toolbox, focusJob: null });

    expect(answer.answer).toBe('**Maya Chen** has 5 years of React.');
    // Only the valid tool call executes; the invalid one returns an error result to the model.
    expect(executed).toEqual([{ name: 'find_candidates_by_skills', input: { skills: ['React', 'Node.js'] } }]);
    const second = calls[1]!.body.messages as Array<{ role: string; content: Array<{ type: string; is_error?: boolean }> }>;
    const toolResults = second.at(-1)!;
    expect(toolResults.role).toBe('user');
    expect(toolResults.content.map((c) => c.type)).toEqual(['tool_result', 'tool_result']);
    expect(toolResults.content[1]!.is_error).toBe(true);
    // Tools are declared with JSON schemas.
    const tools = calls[0]!.body.tools as Array<{ name: string; input_schema: { type: string } }>;
    expect(tools.map((t) => t.name)).toContain('search_candidates');
    expect(tools.every((t) => t.input_schema.type === 'object')).toBe(true);
  });
});
