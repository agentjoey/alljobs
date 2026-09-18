export function normalizeCaptureFilename(input: string): string {
  const name = input.normalize("NFC").trim();
  if (!name || name.length > 255 || name === "." || name === ".."
    || /[/\\\u0000-\u001f\u007f]/u.test(input)) throw new Error("INVALID_FILENAME");
  return name.toLowerCase();
}
