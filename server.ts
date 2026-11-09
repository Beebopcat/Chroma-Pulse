import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '20mb' }));

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('API_KEY_MISSING: Please configure a valid GEMINI_API_KEY in the Settings > Secrets panel.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// POST /api/images/generate - Generate a custom stage backdrop with gemini-nano-banana-2.1
app.post('/api/images/generate', async (req, res) => {
  try {
    const { prompt, aspectRatio = '16:9', imageSize = '1K' } = req.body ?? {};
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({ error: 'Please provide a text prompt to generate an image.' });
      return;
    }

    const ai = getGenAIClient();
    const enhancedPrompt = `${prompt.trim()}. Minimalist geometric abstract music visualizer backdrop for a Lumines rhythm puzzle game, vibrant high-contrast color blocking, sleek modern graphic design, no text, no letters, no UI.`;

    const response = await ai.models.generateContent({
      model: 'gemini-nano-banana-2.1',
      contents: {
        parts: [{ text: enhancedPrompt }],
      },
      config: {
        imageConfig: {
          aspectRatio,
          imageSize,
        },
      },
    });

    let imageUrl: string | null = null;
    let modelNote = '';

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        const mime = part.inlineData.mimeType ?? 'image/png';
        imageUrl = `data:${mime};base64,${part.inlineData.data}`;
      } else if (part.text) {
        modelNote += part.text;
      }
    }

    if (!imageUrl) {
      res.status(502).json({
        error: 'The model completed the request but did not return an image part. Try refining your prompt.',
        note: modelNote,
      });
      return;
    }

    res.json({ imageUrl, note: modelNote });
  } catch (err: any) {
    const message = err?.message || String(err);
    const status = err?.status || (message.includes('403') || message.includes('PERMISSION_DENIED') ? 403 : message.includes('429') ? 429 : 500);
    res.status(status).json({
      error: message,
      requiresPaidKey:
        status === 403 ||
        status === 429 ||
        message.includes('API_KEY') ||
        message.includes('PERMISSION_DENIED') ||
        message.includes('RESOURCE_EXHAUSTED'),
    });
  }
});

// POST /api/images/edit - Edit an existing stage backdrop or skin image using gemini-nano-banana-2.1
app.post('/api/images/edit', async (req, res) => {
  try {
    const { prompt, imageDataUrl, aspectRatio = '16:9', imageSize = '1K' } = req.body ?? {};
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({ error: 'Please provide edit instructions in the prompt.' });
      return;
    }
    if (!imageDataUrl || typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:')) {
      res.status(400).json({ error: 'Please provide a valid base64 data URL image to edit.' });
      return;
    }

    const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      res.status(400).json({ error: 'Malformed image data URL.' });
      return;
    }
    const mimeType = match[1];
    const base64Data = match[2];

    const ai = getGenAIClient();
    const response = await ai.models.generateContent({
      model: 'gemini-nano-banana-2.1',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType,
            },
          },
          {
            text: `${prompt.trim()}. Maintain a vibrant, minimalist geometric aesthetic suitable for a Lumines rhythm puzzle backdrop, no text or letters.`,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio,
          imageSize,
        },
      },
    });

    let editedImageUrl: string | null = null;
    let modelNote = '';

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        const mime = part.inlineData.mimeType ?? 'image/png';
        editedImageUrl = `data:${mime};base64,${part.inlineData.data}`;
      } else if (part.text) {
        modelNote += part.text;
      }
    }

    if (!editedImageUrl) {
      res.status(502).json({
        error: 'The model did not return an edited image. Try clearer visual edit instructions.',
        note: modelNote,
      });
      return;
    }

    res.json({ imageUrl: editedImageUrl, note: modelNote });
  } catch (err: any) {
    const message = err?.message || String(err);
    const status = err?.status || (message.includes('403') || message.includes('PERMISSION_DENIED') ? 403 : message.includes('429') ? 429 : 500);
    res.status(status).json({
      error: message,
      requiresPaidKey:
        status === 403 ||
        status === 429 ||
        message.includes('API_KEY') ||
        message.includes('PERMISSION_DENIED') ||
        message.includes('RESOURCE_EXHAUSTED'),
    });
  }
});

async function startServer() {
  const port = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Chroma Pulse server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
