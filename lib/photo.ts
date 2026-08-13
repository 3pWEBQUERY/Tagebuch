"use client";

import type { Photo } from "./types";

/**
 * Bilder werden im Browser verkleinert, bevor sie das Gerät verlassen.
 *
 * Ein Handyfoto hat schnell 4 MB; im Feed ist es nie größer als ein paar
 * hundert Pixel breit. Wer das ungefragt hochlädt, verbraucht fremdes
 * Datenvolumen und füllt die Datenbank mit Ballast.
 */

const MAX_EDGE = 1600;
const TARGET_BYTES = 700 * 1024;

async function loadBitmap(file: File): Promise<ImageBitmap> {
  // createImageBitmap dreht EXIF-gedrehte Fotos gleich richtig herum.
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

function scaledSize(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= MAX_EDGE) return { width, height };
  const factor = MAX_EDGE / longest;
  return { width: Math.round(width * factor), height: Math.round(height * factor) };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export type PreparedPhoto = { blob: Blob; width: number; height: number; preview: string };

/** Verkleinert, dreht richtig und komprimiert – bis unter die Zielgröße. */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Das ist kein Bild.");
  }
  const bitmap = await loadBitmap(file);
  const { width, height } = scaledSize(bitmap.width, bitmap.height);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Bild konnte nicht verarbeitet werden.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // WebP, wo es geht – sonst JPEG. Qualität sinkt schrittweise, bis es passt.
  const type = canvas.toDataURL("image/webp").startsWith("data:image/webp")
    ? "image/webp"
    : "image/jpeg";

  let blob: Blob | null = null;
  for (const quality of [0.82, 0.7, 0.6, 0.5]) {
    blob = await toBlob(canvas, type, quality);
    if (blob && blob.size <= TARGET_BYTES) break;
  }
  if (!blob) throw new Error("Bild konnte nicht verarbeitet werden.");

  return { blob, width, height, preview: URL.createObjectURL(blob) };
}

export async function uploadPhoto(prepared: PreparedPhoto): Promise<Photo> {
  const form = new FormData();
  const extension = prepared.blob.type === "image/webp" ? "webp" : "jpg";
  form.append("photo", prepared.blob, `foto.${extension}`);
  form.append("width", String(prepared.width));
  form.append("height", String(prepared.height));

  const response = await fetch("/api/photos", { method: "POST", body: form });
  if (!response.ok) {
    const message = await response
      .json()
      .then((d: { error?: string }) => d.error)
      .catch(() => undefined);
    throw new Error(message ?? "Bild konnte nicht hochgeladen werden.");
  }
  return ((await response.json()) as { photo: Photo }).photo;
}

export const photoUrl = (id: string) => `/api/photos/${id}`;
