// PDF files live on disk; the database stores only their path, size and SHA-256.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { HttpError } from "@/lib/api/http";

function uploadRoot(): string {
  // turbopackIgnore: the folder is chosen at runtime, so the bundler must not try to trace it.
  return path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR ?? "uploads");
}

function maxBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_MB ?? 20);
  return (Number.isFinite(mb) && mb > 0 ? mb : 20) * 1024 * 1024;
}

/** Resolve a stored relative path and refuse anything outside the upload folder (path traversal). */
function absolutePath(relativePath: string): string {
  const root = uploadRoot();
  const full = path.resolve(root, relativePath);
  if (!full.startsWith(root + path.sep)) throw new HttpError(400, "Invalid file path");
  return full;
}

export interface StoredPdf {
  relativePath: string;
  sizeBytes: number;
  sha256: string;
}

export async function savePdf(file: File): Promise<StoredPdf> {
  if (file.size === 0) throw new HttpError(400, "The PDF file is empty");
  if (file.size > maxBytes()) throw new HttpError(413, `PDF is larger than ${maxBytes() / 1024 / 1024} MB`);

  const bytes = Buffer.from(await file.arrayBuffer());
  // Check the file signature, not just the name or browser-reported type.
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new HttpError(400, "Only PDF files can be uploaded");
  }

  const relativePath = path.posix.join(String(new Date().getFullYear()), `${randomUUID()}.pdf`);
  const full = absolutePath(relativePath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes, { flag: "wx" });

  return {
    relativePath,
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function readPdf(relativePath: string): Promise<Buffer> {
  return readFile(/* turbopackIgnore: true */ absolutePath(relativePath));
}

export async function deletePdf(relativePath: string | null | undefined): Promise<void> {
  if (!relativePath) return;
  await rm(absolutePath(relativePath), { force: true });
}
