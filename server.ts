import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import healthHandler from './api/health';
import authHandler from './api/auth';
import stateHandler from './api/state';
import adminUsersHandler from './api/admin-users';
import parseReceiptHandler from './api/parse-receipt';
import type { ApiRequestLike, ApiResponseLike } from './api/_lib/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

function adaptExpressHandler(
  handler: (req: ApiRequestLike, res: ApiResponseLike) => void | Promise<void>
): express.RequestHandler {
  return async (req, res) => {
    const wrappedReq: ApiRequestLike = {
      method: req.method,
      url: req.originalUrl,
      headers: req.headers as Record<string, string | string[] | undefined>,
      query: req.query as Record<string, string | string[] | undefined>,
      body: req.body,
    };

    const wrappedRes: ApiResponseLike = {
      status(code: number) {
        res.status(code);
        return wrappedRes;
      },
      json(body: unknown) {
        res.json(body);
      },
      setHeader(name: string, value: string | string[]) {
        res.setHeader(name, value);
      },
    };

    await handler(wrappedReq, wrappedRes);
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.all('/api/health', adaptExpressHandler(healthHandler));
  app.all('/api/auth', adaptExpressHandler(authHandler));
  app.all('/api/state', adaptExpressHandler(stateHandler));
  app.all('/api/admin-users', adaptExpressHandler(adminUsersHandler));
  app.all('/api/parse-receipt', adaptExpressHandler(parseReceiptHandler));

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DespensaForte server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
