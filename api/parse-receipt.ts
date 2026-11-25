import { GoogleGenAI, Type } from '@google/genai';
import {
  checkOcrQuotaForUser,
  getAuthenticatedUser,
  getCurrentMonthKey,
  incrementOcrUsage,
} from './_lib/auth.js';
import { isStorageReady } from './_lib/store.js';
import type { ApiRequestLike, ApiResponseLike } from './_lib/types.js';

const VALID_CATEGORIES = [
  'Hortifruti & Feira',
  'Padaria & Laticínios',
  'Grãos & Secos',
  'Proteínas & Enlatados',
  'Água & Bebidas',
  'Óleos & Temperos',
  'Higiene & Limpeza',
  'Primeiros Socorros & Energia',
  'Outros',
];

export default async function handler(req: ApiRequestLike, res: ApiResponseLike) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido. Use POST.' });
    return;
  }

  try {
    if (!isStorageReady()) {
      res.status(503).json({
        error: 'Banco de dados na nuvem não configurado. Conecte o Upstash Redis na Vercel.',
      });
      return;
    }

    const sessionUser = await getAuthenticatedUser(req);
    if (!sessionUser) {
      res.status(401).json({
        error: 'Faça login com seu usuário e senha para usar a leitura de cupons por foto.',
      });
      return;
    }

    const monthKey = getCurrentMonthKey();
    const quota = await checkOcrQuotaForUser(sessionUser, monthKey);
    if (!quota.allowed) {
      res.status(429).json({
        error: `Você atingiu o limite de ${quota.limit} leituras por foto neste mês (${monthKey}). Use a aba "Texto Local / Offline" ou solicite ampliação ao administrador.`,
      });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (
      !apiKey ||
      apiKey === 'MY_GEMINI_API_KEY' ||
      apiKey.includes('COLE_SUA_CHAVE')
    ) {
      res.status(503).json({
        error:
          'Chave Gemini API não configurada no servidor. Configure GEMINI_API_KEY nas Environment Variables da Vercel ou use a importação de texto/cupom exemplo localmente.',
      });
      return;
    }

    const rawBody =
      typeof req.body === 'string'
        ? (JSON.parse(req.body) as Record<string, unknown>)
        : ((req.body ?? {}) as Record<string, unknown>);

    const imageBase64 = typeof rawBody.imageBase64 === 'string' ? rawBody.imageBase64 : '';
    const mimeType = typeof rawBody.mimeType === 'string' ? rawBody.mimeType : '';
    const todayIso = typeof rawBody.todayIso === 'string' ? rawBody.todayIso : '';

    if (!imageBase64) {
      res.status(400).json({ error: 'Nenhuma imagem de cupom fiscal foi enviada.' });
      return;
    }

    const cleanBase64 = imageBase64.includes(',')
      ? imageBase64.split(',')[1]
      : imageBase64;
    const safeMimeType =
      mimeType && mimeType.startsWith('image/') ? mimeType : 'image/jpeg';
    const referenceDate = todayIso || new Date().toISOString().slice(0, 10);

    const ai = new GoogleGenAI({ apiKey });

    const prompt = [
      'Você é um especialista em leitura de cupons fiscais brasileiros (NFC-e / SAT / Cupom Fiscal) para controle de gastos de feira, despensa doméstica e estocagem.',
      `Data de referência de hoje: ${referenceDate}.`,
      'Analise a imagem do cupom fiscal enviada e extraia todos os produtos comprados com máxima precisão.',
      'Regras:',
      '1. Extraia o nome do estabelecimento e a data da compra no formato YYYY-MM-DD (se não visível, use a data de referência).',
      '2. Para cada item, forneça um nome limpo e legível em português (expanda abreviações comuns de cupom como "ARZ" -> "Arroz", "FJ" -> "Feijão", "OL" -> "Óleo", "TOM" -> "Tomate", mantendo peso/volume como "5kg", "1L", "900ml").',
      `3. Classifique cada item em exatamente uma destas categorias: ${VALID_CATEGORIES.join(', ')}.`,
      '4. Extraia quantidade (quantity), unidade (ex: un, kg, L, pct, lata, cx, bdj), preço unitário (unitPrice) e preço total do item (totalPrice).',
      '5. Estime a validade típica de prateleira em dias (suggestedShelfLifeDays) apenas como referência sob demanda (ex: hortifruti ~ 7 dias, padaria/laticínios ~ 14 dias, arroz/feijão ~ 365 dias, enlatados ~ 730 dias, óleo ~ 365 dias, água mineral ~ 365 dias, higiene/limpeza ~ 1095 dias).',
      '6. Estime um preço médio de referência de mercado (estimatedMarketPrice) realista para supermercado brasileiro em Reais (BRL), ou igual ao unitPrice se incerto.',
    ].join('\n');

    const candidateModels = Array.from(
      new Set(
        [
          process.env.GEMINI_MODEL?.trim(),
          'gemini-3.8-flash',
          'gemini-3.8-flash-lite',
          'gemini-3.5-flash',
          'gemini-2.5-flash-lite',
          'gemini-2.5-flash',
        ].filter((m): m is string => Boolean(m))
      )
    );

    const requestConfig = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          storeName: { type: Type.STRING, description: 'Nome do mercado ou estabelecimento' },
          purchaseDate: { type: Type.STRING, description: 'Data da compra YYYY-MM-DD' },
          totalAmount: { type: Type.NUMBER, description: 'Valor total do cupom fiscal em BRL' },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: 'Nome legível do produto com embalagem/peso' },
                category: { type: Type.STRING, description: 'Uma das categorias válidas' },
                quantity: { type: Type.NUMBER, description: 'Quantidade comprada' },
                unit: { type: Type.STRING, description: 'Unidade de medida (un, kg, L, pct, lata, cx, bdj)' },
                unitPrice: { type: Type.NUMBER, description: 'Preço unitário pago em BRL' },
                totalPrice: { type: Type.NUMBER, description: 'Preço total da linha em BRL' },
                suggestedShelfLifeDays: { type: Type.INTEGER, description: 'Dias estimados de validade para sugestão sob demanda' },
                estimatedMarketPrice: { type: Type.NUMBER, description: 'Preço unitário de referência estimado em BRL' },
              },
              required: [
                'name',
                'category',
                'quantity',
                'unit',
                'unitPrice',
                'totalPrice',
                'suggestedShelfLifeDays',
              ],
            },
          },
        },
        required: ['storeName', 'purchaseDate', 'totalAmount', 'items'],
      },
    };

    const contents = {
      parts: [
        {
          inlineData: {
            mimeType: safeMimeType,
            data: cleanBase64,
          },
        },
        { text: prompt },
      ],
    };

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    let response = null;
    let lastError: unknown = null;
    let sawHighDemand = false;

    for (const modelName of candidateModels) {
      const maxAttempts = modelName === candidateModels[0] ? 2 : 1;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents,
            config: requestConfig,
          });
          break;
        } catch (err) {
          lastError = err;
          const msg = err instanceof Error ? err.message : String(err);
          const isNotFound = /404|NOT_FOUND|no longer available/i.test(msg);
          const isTransient = /503|UNAVAILABLE|high demand|overloaded|429|RESOURCE_EXHAUSTED/i.test(msg);

          if (isNotFound) {
            break;
          }
          if (isTransient) {
            sawHighDemand = true;
            if (attempt < maxAttempts) {
              await sleep(1500);
              continue;
            }
            break;
          }
          throw err;
        }
      }
      if (response) break;
    }

    if (!response) {
      if (sawHighDemand) {
        res.status(503).json({
          error:
            'O serviço gratuito do Google Gemini está temporariamente sobrecarregado (pico de demanda). Aguarde cerca de 10 segundos e tente enviar a foto novamente — ou use a aba "Texto Local / Offline".',
        });
        return;
      }
      throw lastError ?? new Error('Nenhum modelo Gemini disponível respondeu à solicitação.');
    }

    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      res.status(502).json({ error: 'O modelo não retornou dados legíveis para este cupom.' });
      return;
    }

    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    const usedAfter = await incrementOcrUsage(sessionUser.id, monthKey);

    res.status(200).json({
      ...parsed,
      _ocrUsage: {
        used: usedAfter,
        limit: sessionUser.role === 'admin' ? -1 : sessionUser.ocrMonthlyLimit,
        monthKey,
      },
    });
  } catch (error) {
    console.error('Erro ao analisar cupom fiscal (Vercel API):', error);
    const message = error instanceof Error ? error.message : 'Erro interno ao ler cupom fiscal.';
    if (/503|UNAVAILABLE|high demand|overloaded/i.test(message)) {
      res.status(503).json({
        error:
          'O serviço gratuito do Google Gemini está temporariamente sobrecarregado (pico de demanda). Aguarde alguns segundos e tente enviar a foto novamente.',
      });
      return;
    }
    res.status(500).json({ error: `Falha ao processar imagem do cupom: ${message}` });
  }
}
