import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  try {
    const { text } = await request.json();

    if (!text || typeof text !== "string" || text.trim().length < 2) {
      return NextResponse.json({ error: "Text too short to search" }, { status: 400 });
    }

    // execFile com array de args — sem shell, sem injeção de comandos
    const { stdout } = await execFileAsync("grep", [
      "-l", "-r",
      "--include=*.tsx",
      "--include=*.ts",
      "--exclude-dir=.next",
      "--exclude-dir=node_modules",
      "--exclude-dir=dist",
      text.trim(),
      ".",
    ]);

    const filePath = stdout.split("\n").filter(Boolean)[0] ?? "";

    if (filePath) {
      const absolutePath = path.resolve(process.cwd(), filePath);
      return NextResponse.json({ filePath: absolutePath });
    }

    return NextResponse.json({ error: "File not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
