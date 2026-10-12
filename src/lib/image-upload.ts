// Keep a safety margin for multipart form data under Vercel's function payload limit.
export const MAX_ROSTER_IMAGE_BYTES = 4 * 1024 * 1024 - 256 * 1024;
