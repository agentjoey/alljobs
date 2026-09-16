import { createHash } from "node:crypto";
import sharp from "sharp";
import { BarcodeFormat, QRCodeWriter } from "@zxing/library";
import type { ObjectRef } from "../domain/types";

export async function createRasterFixture(input: {
  width?: number;
  height?: number;
  border?: number;
  orientation?: number;
} = {}): Promise<Uint8Array> {
  const width = input.width ?? 96;
  const height = input.height ?? 64;
  const border = input.border ?? 4;
  const channels = 3;
  const pixels = Buffer.alloc(width * height * channels, 255);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      const isBorder = x < border || y < border || x >= width - border || y >= height - border;
      const value = isBorder ? 0 : ((x * 17 + y * 31) % 180) + 40;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
    }
  }

  let image = sharp(pixels, { raw: { width, height, channels } });
  if (input.orientation) image = image.jpeg().withMetadata({ orientation: input.orientation });
  else image = image.png();
  return new Uint8Array(await image.toBuffer());
}

export function objectRefFor(bytes: Uint8Array): ObjectRef {
  const digest = createHash("sha256").update(bytes).digest("hex");
  return {
    algorithm: "sha256",
    digest,
    key: `sha256/${digest.slice(0, 2)}/${digest}`,
    bytes: bytes.byteLength
  };
}

export async function createQrFixture(payload: string): Promise<Uint8Array> {
  const size = 160;
  const matrix = new QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, size, size, new Map());
  const pixels = Buffer.alloc(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) pixels[y * size + x] = matrix.get(x, y) ? 0 : 255;
  }
  return new Uint8Array(await sharp(pixels, { raw: { width: size, height: size, channels: 1 } }).png().toBuffer());
}
