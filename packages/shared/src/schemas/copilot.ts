import { z } from 'zod';
import { idSchema } from './common';

export const copilotChatSchema = z.object({
  message: z.string().trim().min(1, { error: 'Ask a question' }).max(2000),
  conversationId: idSchema.optional(),
  /** Optional job focus; tools scope results to this job when provided. */
  jobId: idSchema.optional(),
});
export type CopilotChatInput = z.infer<typeof copilotChatSchema>;

/** A candidate the assistant referenced, verified server-side against retrieved data. */
export interface CopilotCandidateReference {
  candidateId: string;
  name: string;
  applicationId: string | null;
  jobTitle: string | null;
  score: number | null;
}

export interface CopilotAnswer {
  conversationId: string;
  messageId: string;
  answer: string;
  references: CopilotCandidateReference[];
  toolsUsed: string[];
  provider: string;
}
