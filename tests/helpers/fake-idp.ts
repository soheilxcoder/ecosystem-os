/**
 * A real, listening, minimal OIDC provider for integration tests.
 *
 * The OIDC client is exercised over real HTTP against this server, so discovery,
 * the token exchange and the userinfo call are all covered the way they will be
 * used in production — no stubbing of the client itself.
 */

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

export interface FakeIdpOptions {
  users: Record<string, { sub: string; email: string; name: string; picture?: string }>;
  /** Codes the provider will accept. */
  validCodes?: Record<string, string>; // code -> sub
}

export interface FakeIdp {
  issuer: string;
  close(): Promise<void>;
  /** Codes issued by `authorizationUrl` for a given subject. */
  issueCode(sub: string): string;
}

export async function startFakeIdp(options: FakeIdpOptions): Promise<FakeIdp> {
  const app: FastifyInstance = Fastify({ logger: false });

  // Real identity providers accept application/x-www-form-urlencoded token
  // requests; Fastify needs this parser to behave like one.
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => {
      try {
        done(null, Object.fromEntries(new URLSearchParams(String(body ?? ''))));
      } catch (error) {
        done(error as Error, undefined);
      }
    },
  );

  const validCodes = options.validCodes ?? {};
  const codeToSub = new Map<string, string>(Object.entries(validCodes));
  const accessTokens = new Map<string, string>(); // token -> sub

  app.get('/.well-known/openid-configuration', async () => ({
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    userinfo_endpoint: `${issuer}/userinfo`,
    jwks_uri: `${issuer}/jwks`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
  }));

  app.post('/token', async (request, reply) => {
    const form = request.body as { code?: string; grant_type?: string };
    if (form.grant_type !== 'authorization_code' || !form.code) {
      return reply.code(400).send({ error: 'invalid_request' });
    }
    const sub = codeToSub.get(form.code);
    if (!sub) {
      return reply.code(400).send({ error: 'invalid_grant' });
    }
    codeToSub.delete(form.code); // single use
    const accessToken = `at_${crypto.randomUUID()}`;
    accessTokens.set(accessToken, sub);
    return reply.send({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      id_token: 'not-used',
    });
  });

  app.get('/userinfo', async (request, reply) => {
    const header = request.headers.authorization ?? '';
    const token = header.replace(/^Bearer\s+/i, '');
    const sub = accessTokens.get(token);
    if (!sub) {
      return reply.code(401).send({ error: 'invalid_token' });
    }
    const user = Object.values(options.users).find((u) => u.sub === sub);
    if (!user) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return reply.send(user);
  });

  let issuer = '';
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  issuer = address.replace(/\/$/, '');

  return {
    get issuer() {
      return issuer;
    },
    issueCode(sub: string) {
      const code = `code_${crypto.randomUUID()}`;
      codeToSub.set(code, sub);
      return code;
    },
    async close() {
      await app.close();
    },
  };
}
