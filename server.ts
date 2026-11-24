import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const VALID_CATEGORIES = [
  'Grãos & Secos',
  'Proteínas & Enlatados',
  'Água & Bebidas',
  'Óleos & Temperos',
  'Higiene & Limpeza',
  'Primeiros Socorros & Energia',
  'Outros',
];

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', localFirst: true });
  });

  app.post('/api/parse-receipt', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        res.status(503).json({
          error: 'Chave Gemini API não configurada no servidor. Configure GEMINI_API_KEY nos Segredos do projeto ou use a importação de texto/cupom exemplo localmente.',
        });
        return;
      }

      const { imageBase64, mimeType, todayIso } = req.body as {
        imageBase64?: string;
        mimeType?: string;
        todayIso?: string;
      };

      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({ error: 'Nenhuma imagem de cupom fiscal foi enviada.' });
        return;
      }

      const cleanBase64 = imageBase64.includes(',')
        ? imageBase64.split(',')[1]
        : imageBase64;
      const safeMimeType = mimeType && mimeType.startsWith('image/')
        ? mimeType
        : 'image/jpeg';
      const referenceDate = todayIso || new Date().toISOString().slice(0, 10);

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = [
        'Você é um especialista em leitura de cupons fiscais brasileiros (NFC-e / SAT / Cupom Fiscal) e gestão de despensa/sobrevivencialismo.',
        `Data de referência de hoje: ${referenceDate}.`,
        'Analise a imagem do cupom fiscal enviada e extraia todos os produtos comprados com máxima precisão.',
        'Regras:',
        '1. Extraia o nome do estabelecimento e a data da compra no formato YYYY-MM-DD (se não visível, use a data de referência).',
        '2. Para cada item, forneça um nome limpo e legível em português (expanda abreviações comuns de cupom como "ARZ" -> "Arroz", "FJ" -> "Feijão", "OL" -> "Óleo", mantendo peso/volume como "5kg", "1L", "900ml").',
        `3. Classifique cada item em exatamente uma destas categorias: ${VALID_CATEGORIES.join(', ')}.`,
        '4. Extraia quantidade (quantity), unidade (ex: un, kg, L, pct, lata, cx), preço unitário (unitPrice) e preço total do item (totalPrice).',
        '5. Estime a validade típica de prateleira em dias (suggestedShelfLifeDays) para estocagem doméstica/sobrevivencialismo (ex: arroz/feijão ~ 365 dias, enlatados ~ 730 dias, óleo ~ 365 dias, água mineral ~ 365 dias, café ~ 365 dias, laticínios UHT ~ 120 dias, perecíveis frescos ~ 10 dias, higiene/limpeza ~ 1095 dias).',
        '6. Estime um preço médio de referência de mercado (estimatedMarketPrice) apenas se não houver outro parâmetro, realista para supermercado brasileiro em Reais (BRL), ou igual ao unitPrice se incerto.',
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
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
                    unit: { type: Type.STRING, description: 'Unidade de medida (un, kg, L, pct, lata, cx)' },
                    unitPrice: { type: Type.NUMBER, description: 'Preço unitário pago em BRL' },
                    totalPrice: { type: Type.NUMBER, description: 'Preço total da linha em BRL' },
                    suggestedShelfLifeDays: { type: Type.INTEGER, description: 'Dias estimados de validade na despensa' },
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
      res.json(parsed);
    } catch (error) {
      console.error('Erro ao analisar cupom fiscal:', error);
      const message = error instanceof Error ? error.message : 'Erro interno ao ler cupom fiscal.';
      res.status(500).json({ error: `Falha ao processar imagem do cupom: ${message}` });
    }
  });

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
