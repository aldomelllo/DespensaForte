import { isCloudStorageConfigured, isStorageReady } from './_lib/store.js';
import type { ApiRequestLike, ApiResponseLike } from './_lib/types.js';

export default function handler(req: ApiRequestLike, res: ApiResponseLike) {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const ocrConfigured = Boolean(
    apiKey &&
      apiKey.trim().length > 10 &&
      apiKey !== 'MY_GEMINI_API_KEY' &&
      !apiKey.includes('COLE_SUA_CHAVE')
  );

  res.status(200).json({
    status: 'ok',
    localFirst: false,
    multiTenant: true,
    storageConfigured: isCloudStorageConfigured(),
    storageReady: isStorageReady(),
    ocrConfigured,
    model: process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash',
    timestamp: new Date().toISOString(),
  });
}
