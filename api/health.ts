interface ApiRequestLike {
  method?: string;
}

interface ApiResponseLike {
  status(code: number): ApiResponseLike;
  json(body: unknown): void;
  setHeader?(name: string, value: string): void;
}

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
    localFirst: true,
    ocrConfigured,
    model: 'gemini-2.5-flash',
    timestamp: new Date().toISOString(),
  });
}
