import { GoogleGenAI } from '@google/genai';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs'; // Use nodejs runtime for streaming and large payloads

export async function POST(req: NextRequest) {
  try {
    const { pdfText, question } = await req.json();

    if (!pdfText) {
      return new Response(JSON.stringify({ error: 'PDF text context is missing or empty.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!question) {
      return new Response(JSON.stringify({ error: 'User question is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: 'Gemini API key is not configured. Please add GEMINI_API_KEY to your .env.local file.',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    
    // Default to gemini-1.5-pro for its massive context window (2M tokens)
    const model = process.env.GEMINI_MODEL || 'gemini-1.5-pro';

    // Construct prompt strictly matching the user constraints:
    // [SYSTEM]: "Answer the user's question using ONLY the provided document context. If the answer is not in the text, state that."
    // [CONTEXT]: {entire_extracted_pdf_text}
    // [USER]: {user_question}
    const prompt = `[SYSTEM]: "Answer the user's question using ONLY the provided document context. If the answer is not in the text, state that."\n\n[CONTEXT]: ${pdfText}\n\n[USER]: ${question}`;

    const responseStream = await ai.models.generateContentStream({
      model,
      contents: prompt,
    });

    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of responseStream) {
            const text = chunk.text;
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
          controller.close();
        } catch (error: any) {
          console.error('Error during LLM stream generation:', error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('Error in API route:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'An error occurred during prompt compilation and stream initialization.',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
