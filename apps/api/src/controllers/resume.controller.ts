import { idParamSchema } from '@hireflow/shared';
import type { Container } from '../container';
import { accepted, handle, ok } from '../lib/http';
import { authOf } from '../middleware/auth';
import { assertPdfUpload } from '../middleware/upload';

export function createResumeController({ services }: Container) {
  const { resumes } = services;
  return {
    upload: handle({}, async ({ req }) => {
      const file = assertPdfUpload(req.file);
      const resume = await resumes.upload(authOf(req).userId, file);
      return accepted(
        resume,
        'Resume uploaded. We are extracting your profile — this usually takes a few seconds.',
      );
    }),
    list: handle({}, async ({ req }) => ok(await resumes.list(authOf(req).userId))),
    get: handle({ params: idParamSchema }, async ({ req, params }) =>
      ok(await resumes.get(authOf(req), params.id)),
    ),
    download: handle({ params: idParamSchema }, async ({ req, res, params }) => {
      const file = await resumes.download(authOf(req), params.id, req.ip ?? null);
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Length', String(file.buffer.length));
      res.setHeader('Content-Disposition', `inline; filename="${file.fileName.replace(/"/g, '')}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(file.buffer);
      return undefined;
    }),
    retry: handle({ params: idParamSchema }, async ({ req, params }) =>
      accepted(await resumes.retry(authOf(req).userId, params.id), 'Parsing restarted'),
    ),
    setPrimary: handle({ params: idParamSchema }, async ({ req, params }) =>
      ok(await resumes.setPrimary(authOf(req).userId, params.id), {
        message: 'Primary resume updated',
      }),
    ),
    remove: handle({ params: idParamSchema }, async ({ req, params }) => {
      await resumes.delete(authOf(req).userId, params.id);
      return ok(null, { message: 'Resume deleted' });
    }),
  };
}
