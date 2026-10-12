import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildAnalysisPrompt, parseGeminiResponse } from "@/lib/image-analysis";
import { MAX_ROSTER_IMAGE_BYTES } from "@/lib/image-upload";
import type { GameVersion } from "@/lib/types";
import { checkRequestLimit } from "@/lib/request-rate-limit";

// Keep the whole request under Vercel Functions' 4.5 MB payload ceiling.
const MAX_IMAGE_BYTES = MAX_ROSTER_IMAGE_BYTES;
const MAX_MULTIPART_BYTES = 4 * 1024 * 1024;

class RequestBodyTooLargeError extends Error {}

async function readBoundedBody(request: Request): Promise<Uint8Array<ArrayBuffer>> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isFinite(length) || length < 0) throw new Error("Geçersiz istek boyutu.");
    if (length > MAX_MULTIPART_BYTES) throw new RequestBodyTooLargeError();
  }

  if (!request.body) throw new Error("Görsel isteği boş.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_MULTIPART_BYTES) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function detectImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 12
    && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") {
    return "image/webp";
  }
  return null;
}

export async function POST(req: NextRequest) {
  let rate: Awaited<ReturnType<typeof checkRequestLimit>>;
  try {
    rate = await checkRequestLimit(req, "image-analysis", 5, 60_000);
  } catch {
    return NextResponse.json(
      { error: "Görsel analiz şu anda kullanılamıyor. Lütfen daha sonra tekrar dene." },
      { status: 503 }
    );
  }
  if (!rate.configured) {
    return NextResponse.json(
      { error: "Görsel analiz hız sınırı yapılandırılmamış. Supabase ortam değişkenlerini kontrol edin." },
      { status: 503 }
    );
  }
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Çok sık görsel analizi isteği gönderildi. Biraz sonra tekrar dene." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } }
    );
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "buraya_api_anahtarinizi_yazin" || apiKey.trim() === "") {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY tanımlanmamış. Lütfen .env.local dosyasına geçerli bir Google Gemini API anahtarı ekleyin veya kadroyu manuel girin.",
        },
        { status: 400 }
      );
    }

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
      return NextResponse.json({ error: "Görsel multipart/form-data olarak gönderilmeli." }, { status: 415 });
    }

    const body = await readBoundedBody(req);
    const formData = await new Response(body, { headers: { "content-type": contentType } }).formData();
    const file = formData.get("image");
    const gameValue = formData.get("game");
    const game = typeof gameValue === "string" ? gameValue : "fifa15";

    if (game !== "fifa14" && game !== "fifa15") {
      return NextResponse.json({ error: "Oyun sürümü geçersiz." }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Lütfen bir kadro görseli yükleyin." },
        { status: 400 }
      );
    }

    // Leave room for multipart headers and boundaries.
    if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Görsel boş olamaz ve en fazla 3.75 MB olabilir." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const mimeType = detectImageMime(buffer);
    if (!mimeType || (file.type && file.type !== mimeType)) {
      return NextResponse.json({ error: "Yalnızca geçerli PNG, JPEG veya WEBP görselleri destekleniyor." }, { status: 415 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const prompt = buildAnalysisPrompt(game);

    const imagePart = {
      inlineData: {
        data: buffer.toString("base64"),
        mimeType: mimeType,
      },
    };

    // Güncel ve desteklenen Gemini modelleri (sırayla denenir)
    const CANDIDATE_MODELS = [
      "gemini-3.8-flash",
      "gemini-flash-latest",
      "gemini-2.5-pro",
      "gemini-3.5-flash",
    ];

    let responseText = "";
    let lastError: Error | null = null;

    for (const modelName of CANDIDATE_MODELS) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent([prompt, imagePart]);
        responseText = result.response.text();
        if (responseText) break;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`Model ${modelName} başarısız oldu, bir sonraki deneniyor:`, lastError.message);
      }
    }

    if (!responseText) {
      throw lastError || new Error("Hiçbir Gemini modeli yanıt veremedi.");
    }

    const analysis = parseGeminiResponse(responseText);

    if (analysis.error && (!analysis.players || analysis.players.length === 0)) {
      return NextResponse.json(
        {
          error: `Görsel analiz edilemedi: ${analysis.error}`,
          raw: responseText,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      formation: analysis.formation,
      players: analysis.players,
    });
  } catch (err: unknown) {
    if (err instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "İstek boyutu en fazla 4 MB olabilir." }, { status: 413 });
    }
    console.error("Görsel analiz hatası:", err);
    const message = err instanceof Error ? err.message : "Bilinmeyen bir hata oluştu";
    return NextResponse.json(
      { error: `Görsel işlenirken sunucu hatası oluştu: ${message}` },
      { status: 500 }
    );
  }
}
