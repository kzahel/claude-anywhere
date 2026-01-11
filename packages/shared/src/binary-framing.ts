/**
 * Binary framing utilities for WebSocket relay protocol.
 *
 * Phase 0 - Unencrypted binary frames:
 * [1 byte: format][payload]
 *
 * Phase 1 - Encrypted binary envelope:
 * [1 byte: version][24 bytes: nonce][ciphertext]
 *
 * The ciphertext decrypts to:
 * [1 byte: format][payload]
 *
 * Format values:
 *   0x01 = UTF-8 JSON string
 *   0x02 = binary upload chunk (future - Phase 2)
 *   0x03 = gzip-compressed JSON (future - Phase 3)
 *   0x04-0xFF = reserved
 */

/** Format byte values for binary WebSocket frames */
export const BinaryFormat = {
  /** UTF-8 encoded JSON string */
  JSON: 0x01,
  /** Binary upload chunk (Phase 2) */
  BINARY_UPLOAD: 0x02,
  /** Gzip-compressed JSON (Phase 3) */
  COMPRESSED_JSON: 0x03,
} as const;

export type BinaryFormatValue =
  (typeof BinaryFormat)[keyof typeof BinaryFormat];

/** Error thrown when binary frame parsing fails */
export class BinaryFrameError extends Error {
  constructor(
    message: string,
    public readonly code: "UNKNOWN_FORMAT" | "INVALID_UTF8" | "INVALID_JSON",
  ) {
    super(message);
    this.name = "BinaryFrameError";
  }
}

/**
 * Encode a JSON message as a binary frame with format byte 0x01.
 *
 * @param message - Any JSON-serializable value
 * @returns ArrayBuffer containing [0x01][UTF-8 JSON bytes]
 */
export function encodeJsonFrame(message: unknown): ArrayBuffer {
  const json = JSON.stringify(message);
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(json);

  // Create buffer with format byte + JSON payload
  const buffer = new ArrayBuffer(1 + jsonBytes.length);
  const view = new Uint8Array(buffer);
  view[0] = BinaryFormat.JSON;
  view.set(jsonBytes, 1);

  return buffer;
}

/**
 * Decode a binary frame and return its format and payload.
 *
 * @param data - ArrayBuffer or Uint8Array containing the binary frame
 * @returns Object with format byte and remaining payload bytes
 * @throws BinaryFrameError if format byte is unknown
 */
export function decodeBinaryFrame(data: ArrayBuffer | Uint8Array): {
  format: BinaryFormatValue;
  payload: Uint8Array;
} {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;

  if (bytes.length === 0) {
    throw new BinaryFrameError("Empty binary frame", "UNKNOWN_FORMAT");
  }

  const format = bytes[0] as number;

  // Validate format byte
  if (
    format !== BinaryFormat.JSON &&
    format !== BinaryFormat.BINARY_UPLOAD &&
    format !== BinaryFormat.COMPRESSED_JSON
  ) {
    throw new BinaryFrameError(
      `Unknown format byte: 0x${format.toString(16).padStart(2, "0")}`,
      "UNKNOWN_FORMAT",
    );
  }

  return {
    format: format as BinaryFormatValue,
    payload: bytes.slice(1),
  };
}

/**
 * Decode a JSON binary frame (format 0x01) directly to a parsed object.
 *
 * @param data - ArrayBuffer or Uint8Array containing the binary frame
 * @returns Parsed JSON value
 * @throws BinaryFrameError if frame is invalid or not format 0x01
 */
export function decodeJsonFrame<T = unknown>(
  data: ArrayBuffer | Uint8Array,
): T {
  const { format, payload } = decodeBinaryFrame(data);

  if (format !== BinaryFormat.JSON) {
    throw new BinaryFrameError(
      `Expected JSON format (0x01), got 0x${format.toString(16).padStart(2, "0")}`,
      "UNKNOWN_FORMAT",
    );
  }

  const decoder = new TextDecoder("utf-8", { fatal: true });
  let json: string;
  try {
    json = decoder.decode(payload);
  } catch {
    throw new BinaryFrameError("Invalid UTF-8 in payload", "INVALID_UTF8");
  }

  try {
    return JSON.parse(json) as T;
  } catch {
    throw new BinaryFrameError("Invalid JSON in payload", "INVALID_JSON");
  }
}

/**
 * Check if data is a binary frame (ArrayBuffer or Buffer) vs text frame (string).
 *
 * In browser: binary data is ArrayBuffer
 * In Node.js: binary data is Buffer (which is Uint8Array)
 *
 * @param data - WebSocket message data
 * @returns true if data is binary, false if string
 */
export function isBinaryData(data: unknown): data is ArrayBuffer | Uint8Array {
  if (typeof data === "string") {
    return false;
  }
  // ArrayBuffer in browser
  if (data instanceof ArrayBuffer) {
    return true;
  }
  // Buffer or Uint8Array in Node.js (Buffer extends Uint8Array)
  if (data instanceof Uint8Array) {
    return true;
  }
  return false;
}

// =============================================================================
// Phase 1: Binary Encrypted Envelope
// =============================================================================

/**
 * Version byte values for binary encrypted envelope.
 * The version byte is outside the ciphertext to allow for protocol evolution.
 */
export const BinaryEnvelopeVersion = {
  /** Initial binary format (format byte inside ciphertext) */
  V1: 0x01,
} as const;

export type BinaryEnvelopeVersionValue =
  (typeof BinaryEnvelopeVersion)[keyof typeof BinaryEnvelopeVersion];

/** Length of NaCl secretbox nonce (24 bytes) */
export const NONCE_LENGTH = 24;

/** Length of version byte (1 byte) */
export const VERSION_LENGTH = 1;

/** Minimum binary envelope length: version (1) + nonce (24) + MAC (16) + format (1) */
export const MIN_BINARY_ENVELOPE_LENGTH =
  VERSION_LENGTH + NONCE_LENGTH + 16 + 1;

/** Error thrown when binary envelope parsing fails */
export class BinaryEnvelopeError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "UNKNOWN_VERSION"
      | "INVALID_LENGTH"
      | "DECRYPTION_FAILED"
      | "INVALID_FORMAT",
  ) {
    super(message);
    this.name = "BinaryEnvelopeError";
  }
}

/**
 * Parsed components of a binary encrypted envelope.
 * Used for decryption - provides version, nonce, and ciphertext separately.
 */
export interface BinaryEnvelopeComponents {
  /** Protocol version (0x01 = initial) */
  version: BinaryEnvelopeVersionValue;
  /** Random 24-byte nonce */
  nonce: Uint8Array;
  /** Encrypted payload (format byte + inner payload) */
  ciphertext: Uint8Array;
}

/**
 * Parse a binary encrypted envelope into its components.
 *
 * Wire format: [1 byte: version][24 bytes: nonce][ciphertext]
 *
 * @param data - ArrayBuffer or Uint8Array containing the envelope
 * @returns Parsed components (version, nonce, ciphertext)
 * @throws BinaryEnvelopeError if envelope is invalid
 */
export function parseBinaryEnvelope(
  data: ArrayBuffer | Uint8Array,
): BinaryEnvelopeComponents {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;

  if (bytes.length < MIN_BINARY_ENVELOPE_LENGTH) {
    throw new BinaryEnvelopeError(
      `Binary envelope too short: ${bytes.length} bytes (minimum ${MIN_BINARY_ENVELOPE_LENGTH})`,
      "INVALID_LENGTH",
    );
  }

  const version = bytes[0] as number;

  // Validate version byte
  if (version !== BinaryEnvelopeVersion.V1) {
    throw new BinaryEnvelopeError(
      `Unknown envelope version: 0x${version.toString(16).padStart(2, "0")}`,
      "UNKNOWN_VERSION",
    );
  }

  const nonce = bytes.slice(VERSION_LENGTH, VERSION_LENGTH + NONCE_LENGTH);
  const ciphertext = bytes.slice(VERSION_LENGTH + NONCE_LENGTH);

  return {
    version: version as BinaryEnvelopeVersionValue,
    nonce,
    ciphertext,
  };
}

/**
 * Create a binary encrypted envelope from components.
 *
 * @param nonce - 24-byte random nonce
 * @param ciphertext - Encrypted payload
 * @param version - Protocol version (default: V1)
 * @returns ArrayBuffer containing [version][nonce][ciphertext]
 */
export function createBinaryEnvelope(
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  version: BinaryEnvelopeVersionValue = BinaryEnvelopeVersion.V1,
): ArrayBuffer {
  if (nonce.length !== NONCE_LENGTH) {
    throw new BinaryEnvelopeError(
      `Invalid nonce length: ${nonce.length} (expected ${NONCE_LENGTH})`,
      "INVALID_LENGTH",
    );
  }

  const buffer = new ArrayBuffer(
    VERSION_LENGTH + NONCE_LENGTH + ciphertext.length,
  );
  const view = new Uint8Array(buffer);

  view[0] = version;
  view.set(nonce, VERSION_LENGTH);
  view.set(ciphertext, VERSION_LENGTH + NONCE_LENGTH);

  return buffer;
}

/**
 * Prepend a format byte to a payload.
 * Used before encryption to create the inner payload.
 *
 * @param format - Format byte (0x01 = JSON, 0x02 = binary upload, 0x03 = compressed)
 * @param payload - Raw payload bytes
 * @returns Uint8Array with [format][payload]
 */
export function prependFormatByte(
  format: BinaryFormatValue,
  payload: Uint8Array,
): Uint8Array {
  const result = new Uint8Array(1 + payload.length);
  result[0] = format;
  result.set(payload, 1);
  return result;
}

/**
 * Extract format byte and payload from decrypted data.
 *
 * @param decrypted - Decrypted bytes from envelope
 * @returns Object with format byte and payload
 * @throws BinaryEnvelopeError if format byte is invalid
 */
export function extractFormatAndPayload(decrypted: Uint8Array): {
  format: BinaryFormatValue;
  payload: Uint8Array;
} {
  if (decrypted.length === 0) {
    throw new BinaryEnvelopeError("Empty decrypted payload", "INVALID_FORMAT");
  }

  const format = decrypted[0] as number;

  // Validate format byte
  if (
    format !== BinaryFormat.JSON &&
    format !== BinaryFormat.BINARY_UPLOAD &&
    format !== BinaryFormat.COMPRESSED_JSON
  ) {
    throw new BinaryEnvelopeError(
      `Unknown format byte: 0x${format.toString(16).padStart(2, "0")}`,
      "INVALID_FORMAT",
    );
  }

  return {
    format: format as BinaryFormatValue,
    payload: decrypted.slice(1),
  };
}
