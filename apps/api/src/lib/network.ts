import { Agent, setGlobalDispatcher } from 'undici';

/**
 * Configures Node's global fetch dispatcher once per process. The default 10s connect timeout is
 * too aggressive for some networks reaching model CDNs and AI APIs; request-level timeouts are
 * still enforced by the individual clients.
 */
export function configureHttp(): void {
  setGlobalDispatcher(
    new Agent({
      connect: { timeout: 60_000 },
      keepAliveTimeout: 30_000,
    }),
  );
}
