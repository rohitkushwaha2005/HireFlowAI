import type { AuthContext, OrgContext } from './context';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: AuthContext;
      org?: OrgContext;
    }
  }
}

export {};
