import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import {
  interviewQuestionSetSchema,
  jobAnalysisSchema,
  resumeAnalysisSchema,
  type GeneratedInterviewQuestion,
  type JobAnalysis,
  type ResumeAnalysis,
} from '@hireflow/shared';
import { AIUnavailableError } from '../lib/errors';
import type { Logger } from '../lib/logger';
import {
  COPILOT_TOOL_DESCRIPTIONS,
  copilotToolSchemas,
  parseToolInput,
  type CopilotToolName,
} from './copilot/toolbox';
import {
  COPILOT_SYSTEM,
  INTERVIEW_GENERATOR_SYSTEM,
  JOB_ANALYZER_SYSTEM,
  RESUME_PARSER_SYSTEM,
} from './prompts';
import type {
  AIProvider,
  HiringAnswer,
  HiringQuestionInput,
  InterviewInput,
  JobInput,
  ResumeInput,
} from './types';

type Effort = 'low' | 'medium' | 'high';

const MAX_COPILOT_ITERATIONS = 8;
const SERVER_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** Server-side refusal fallback (`fallbacks: "default"`) is supported on these model families. */
function supportsServerFallback(model: string): boolean {
  return /^claude-(opus-5|fable-5)/.test(model);
}

/**
 * Claude implementation of `AIProvider` using the official SDK.
 * - Extraction tasks use structured outputs (`messages.parse` + Zod) and are re-validated.
 * - The copilot is a bounded tool-use loop over tenant-scoped server tools.
 * - API errors are translated into `AIUnavailableError` so callers can retry or mark FAILED.
 */
export class AnthropicProvider implements AIProvider {
  readonly isHeuristic = false;
  readonly name: string;
  private readonly client: Anthropic;
  private readonly fallbackParams: { betas: string[]; fallbacks?: 'default' };

  constructor(
    apiKey: string | undefined,
    private readonly model: string,
    private readonly logger: Logger,
    /** Test seam: a custom fetch lets tests exercise real SDK parsing without network access. */
    clientOptions: { fetch?: typeof fetch; maxRetries?: number } = {},
  ) {
    this.name = `anthropic:${model}`;
    // Without an explicit key the SDK resolves credentials from the environment/profile.
    this.client = new Anthropic({
      ...(apiKey ? { apiKey } : {}),
      maxRetries: clientOptions.maxRetries ?? 3,
      timeout: 180_000,
      ...(clientOptions.fetch ? { fetch: clientOptions.fetch } : {}),
    });
    this.fallbackParams = supportsServerFallback(model)
      ? { betas: [SERVER_FALLBACK_BETA], fallbacks: 'default' }
      : { betas: [] };
  }

  private async structured<S extends z.ZodType>(
    schema: S,
    system: string,
    userContent: string,
    effort: Effort,
    task: string,
  ): Promise<z.infer<S>> {
    const started = Date.now();
    try {
      // `create` (not `parse`) so the stop reason is checked before any parsing: a refusal or a
      // truncated response must never be mistaken for malformed JSON.
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 16_000,
        system,
        thinking: { type: 'adaptive' },
        output_config: { effort, format: betaZodOutputFormat(schema) },
        messages: [{ role: 'user', content: userContent }],
        ...this.fallbackParams,
      });

      this.logger.info(
        {
          task,
          model: response.model,
          stopReason: response.stop_reason,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          durationMs: Date.now() - started,
        },
        'AI structured call completed',
      );

      if (response.stop_reason === 'refusal') {
        throw new AIUnavailableError('The AI model declined to process this content');
      }
      if (response.stop_reason === 'max_tokens') {
        throw new AIUnavailableError('The AI response was truncated; please retry');
      }
      const text = response.content
        .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new AIUnavailableError('The AI response could not be parsed');
      }
      // Structured outputs constrain the shape; Zod enforces our contract before anything is stored.
      return schema.parse(json);
    } catch (error) {
      throw this.translateError(error, task);
    }
  }

  private translateError(error: unknown, task: string): Error {
    if (error instanceof AIUnavailableError) return error;
    if (error instanceof z.ZodError) {
      this.logger.warn({ task, issues: error.issues.slice(0, 5) }, 'AI output failed validation');
      return new AIUnavailableError('The AI response did not match the expected format');
    }
    if (
      error instanceof Anthropic.AuthenticationError ||
      error instanceof Anthropic.PermissionDeniedError
    ) {
      this.logger.error({ task, status: error.status }, 'AI provider rejected credentials');
      return new AIUnavailableError('The AI provider rejected the configured credentials');
    }
    if (error instanceof Anthropic.RateLimitError) {
      return new AIUnavailableError(
        'The AI provider is rate limiting requests; please retry shortly',
      );
    }
    if (error instanceof Anthropic.BadRequestError) {
      this.logger.error({ task, err: error.message }, 'AI request rejected as invalid');
      return new AIUnavailableError('The AI request was rejected');
    }
    if (error instanceof Anthropic.APIError) {
      this.logger.warn({ task, status: error.status }, 'AI provider error');
      return new AIUnavailableError('The AI provider is temporarily unavailable');
    }
    if (error instanceof Anthropic.AnthropicError) {
      this.logger.warn({ task, err: error.message }, 'AI client error');
      return new AIUnavailableError('The AI provider returned an unexpected response');
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  parseResume(input: ResumeInput): Promise<ResumeAnalysis> {
    return this.structured(
      resumeAnalysisSchema,
      RESUME_PARSER_SYSTEM,
      `Extract the structured profile from this resume.\n\n<resume>\n${input.text}\n</resume>`,
      'low',
      'parseResume',
    );
  }

  analyzeJob(input: JobInput): Promise<JobAnalysis> {
    return this.structured(
      jobAnalysisSchema,
      JOB_ANALYZER_SYSTEM,
      `Analyze this job posting.\n\n<title>${input.title}</title>\n<description>\n${input.description}\n</description>`,
      'low',
      'analyzeJob',
    );
  }

  async generateInterviewQuestions(input: InterviewInput): Promise<GeneratedInterviewQuestion[]> {
    const payload = {
      job: input.job,
      candidate: input.candidate,
      match: input.match,
    };
    const instructions = [
      `Write exactly ${input.count} interview questions.`,
      `Use these categories, spread evenly: ${input.categories.join(', ')}.`,
      input.difficulty
        ? `All questions should be ${input.difficulty} difficulty.`
        : 'Mix EASY, MEDIUM and HARD difficulty appropriate to the seniority.',
    ].join(' ');
    const result = await this.structured(
      interviewQuestionSetSchema,
      INTERVIEW_GENERATOR_SYSTEM,
      `${instructions}\n\n<context>\n${JSON.stringify(payload, null, 2)}\n</context>`,
      'medium',
      'generateInterviewQuestions',
    );
    return result.questions.slice(0, input.count);
  }

  async answerHiringQuestion(input: HiringQuestionInput): Promise<HiringAnswer> {
    const tools: Anthropic.Beta.BetaTool[] = (
      Object.keys(copilotToolSchemas) as CopilotToolName[]
    ).map((name) => ({
      name,
      description: COPILOT_TOOL_DESCRIPTIONS[name],
      input_schema: z.toJSONSchema(copilotToolSchemas[name], {
        target: 'draft-7',
      }) as Anthropic.Beta.BetaTool.InputSchema,
    }));

    const focus = input.focusJob
      ? `\n\n(The recruiter is currently focused on the job "${input.focusJob.title}", jobId ${input.focusJob.id}. Scope tools to it when the question is about applicants.)`
      : '';

    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...input.history.map<Anthropic.Beta.BetaMessageParam>((item) => ({
        role: item.role === 'USER' ? 'user' : 'assistant',
        content: item.content,
      })),
      { role: 'user', content: `${input.question}${focus}` },
    ];

    try {
      for (let iteration = 0; iteration < MAX_COPILOT_ITERATIONS; iteration++) {
        const response = await this.client.beta.messages.create({
          model: this.model,
          max_tokens: 16_000,
          system: COPILOT_SYSTEM,
          thinking: { type: 'adaptive' },
          output_config: { effort: 'medium' },
          tools,
          messages,
          ...this.fallbackParams,
        });

        if (response.stop_reason === 'refusal') {
          return {
            answer:
              "I can't help with that request. Try asking about candidates' skills, experience or match results.",
            toolsUsed: input.toolbox.used(),
          };
        }

        messages.push({ role: 'assistant', content: response.content });

        if (response.stop_reason === 'tool_use') {
          const toolUses = response.content.filter(
            (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === 'tool_use',
          );
          const results = await Promise.all(
            toolUses.map(async (block): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
              const parsed = parseToolInput(block.name, block.input);
              if (!parsed.ok) {
                return {
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: parsed.error,
                  is_error: true,
                };
              }
              try {
                const output = await input.toolbox.execute(parsed.name, parsed.input as never);
                return {
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: JSON.stringify(output),
                };
              } catch (error) {
                this.logger.warn({ tool: block.name, err: error }, 'Copilot tool failed');
                return {
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: 'The tool failed to run. Tell the user the data could not be retrieved.',
                  is_error: true,
                };
              }
            }),
          );
          // All tool results go back in a single user message.
          messages.push({ role: 'user', content: results });
          continue;
        }

        if (response.stop_reason === 'pause_turn') continue;

        const answer = response.content
          .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n')
          .trim();
        return {
          answer: answer || 'I could not find an answer in the available data.',
          toolsUsed: input.toolbox.used(),
        };
      }
      return {
        answer:
          'That question needed more steps than allowed. Please narrow it down (for example, to one job or skill).',
        toolsUsed: input.toolbox.used(),
      };
    } catch (error) {
      throw this.translateError(error, 'copilot');
    }
  }
}
