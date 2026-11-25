import { GoogleGenAI, Type } from '@google/genai';

interface ApiRequestLike {
  method?: string;
  body?: unknown;
}

interface ApiResponseLike {
  status(code: number): ApiResponseLike;
  json(body: unknown): void;
}

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

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: safeMimeType,
              data: cleanBase64,
            },
          },
          { text: prompt },
        ],
      },
      config: {
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
      },
    });

    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      res.status(502).json({ error: 'O modelo não retornou dados legíveis para este cupom.' });
      return;
    }

    const parsed = JSON.parse(rawText);
    res.status(200).json(parsed);
  } catch (error) {
    console.error('Erro ao analisar cupom fiscal (Vercel API):', error);
    const message = error instanceof Error ? error.message : 'Erro interno ao ler cupom fiscal.';
    res.status(500).json({ error: `Falha ao processar imagem do cupom: ${message}` });
  }
}
