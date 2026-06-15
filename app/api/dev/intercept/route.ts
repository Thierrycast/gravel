import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

/**
 * Endpoint de desenvolvimento para capturar e persistir payloads do Pluggy Widget.
 * Salva os dados em data/intercept-logs/ para análise profunda.
 */
export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const logDir = path.join(process.cwd(), "data", "intercept-logs");
    
    // Garantir diretório de logs
    await fs.mkdir(logDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const type = payload.type || "event";
    const filename = `${timestamp}_${type}.json`;
    const filePath = path.join(logDir, filename);

    await fs.writeFile(filePath, JSON.stringify(payload, null, 2));

    console.log(`[DevIntercept] Log salvo: ${filename}`);

    return NextResponse.json({ status: "logged", file: filename });
  } catch (error) {
    console.error("[DevIntercept] Falha ao logar payload:", error);
    return NextResponse.json({ error: "Failed to log" }, { status: 500 });
  }
}
