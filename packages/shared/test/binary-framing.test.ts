import { describe, expect, it } from "vitest";
import {
  BinaryEnvelopeError,
  BinaryEnvelopeVersion,
  BinaryFormat,
  BinaryFrameError,
  MIN_BINARY_ENVELOPE_LENGTH,
  NONCE_LENGTH,
  VERSION_LENGTH,
  createBinaryEnvelope,
  decodeBinaryFrame,
  decodeJsonFrame,
  encodeJsonFrame,
  extractFormatAndPayload,
  isBinaryData,
  parseBinaryEnvelope,
  prependFormatByte,
} from "../src/binary-framing.js";

describe("binary-framing", () => {
  describe("encodeJsonFrame", () => {
    it("encodes a simple object", () => {
      const msg = { type: "request", id: "123" };
      const result = encodeJsonFrame(msg);

      expect(result).toBeInstanceOf(ArrayBuffer);
      const bytes = new Uint8Array(result);
      expect(bytes[0]).toBe(BinaryFormat.JSON);

      // Decode the rest as UTF-8 JSON
      const decoder = new TextDecoder();
      const json = decoder.decode(bytes.slice(1));
      expect(JSON.parse(json)).toEqual(msg);
    });

    it("encodes null", () => {
      const result = encodeJsonFrame(null);
      const bytes = new Uint8Array(result);
      expect(bytes[0]).toBe(BinaryFormat.JSON);

      const decoder = new TextDecoder();
      const json = decoder.decode(bytes.slice(1));
      expect(JSON.parse(json)).toBe(null);
    });

    it("encodes arrays", () => {
      const msg = [1, 2, 3];
      const result = encodeJsonFrame(msg);
      const bytes = new Uint8Array(result);

      const decoder = new TextDecoder();
      const json = decoder.decode(bytes.slice(1));
      expect(JSON.parse(json)).toEqual([1, 2, 3]);
    });

    it("encodes strings", () => {
      const msg = "hello world";
      const result = encodeJsonFrame(msg);
      const bytes = new Uint8Array(result);

      const decoder = new TextDecoder();
      const json = decoder.decode(bytes.slice(1));
      expect(JSON.parse(json)).toBe("hello world");
    });

    it("handles UTF-8 characters (emoji)", () => {
      const msg = { text: "Hello 👋 World 🌍" };
      const result = encodeJsonFrame(msg);
      const bytes = new Uint8Array(result);

      const decoder = new TextDecoder();
      const json = decoder.decode(bytes.slice(1));
      expect(JSON.parse(json)).toEqual({ text: "Hello 👋 World 🌍" });
    });

    it("handles multi-byte UTF-8 characters", () => {
      const msg = { text: "日本語テスト" };
      const result = encodeJsonFrame(msg);
      const bytes = new Uint8Array(result);

      const decoder = new TextDecoder();
      const json = decoder.decode(bytes.slice(1));
      expect(JSON.parse(json)).toEqual({ text: "日本語テスト" });
    });

    it("handles mixed ASCII and UTF-8", () => {
      const msg = { greeting: "Hello, 世界! 🎉 Привет мир!" };
      const result = encodeJsonFrame(msg);
      const bytes = new Uint8Array(result);

      const decoder = new TextDecoder();
      const json = decoder.decode(bytes.slice(1));
      expect(JSON.parse(json)).toEqual({
        greeting: "Hello, 世界! 🎉 Привет мир!",
      });
    });
  });

  describe("decodeBinaryFrame", () => {
    it("decodes a format 0x01 frame", () => {
      const payload = new TextEncoder().encode('{"test": true}');
      const buffer = new Uint8Array(1 + payload.length);
      buffer[0] = BinaryFormat.JSON;
      buffer.set(payload, 1);

      const result = decodeBinaryFrame(buffer);
      expect(result.format).toBe(BinaryFormat.JSON);
      expect(result.payload).toEqual(payload);
    });

    it("works with ArrayBuffer input", () => {
      const payload = new TextEncoder().encode('{"test": true}');
      const buffer = new ArrayBuffer(1 + payload.length);
      const view = new Uint8Array(buffer);
      view[0] = BinaryFormat.JSON;
      view.set(payload, 1);

      const result = decodeBinaryFrame(buffer);
      expect(result.format).toBe(BinaryFormat.JSON);
    });

    it("throws BinaryFrameError for empty frame", () => {
      const buffer = new Uint8Array(0);
      expect(() => decodeBinaryFrame(buffer)).toThrow(BinaryFrameError);
      try {
        decodeBinaryFrame(buffer);
      } catch (err) {
        expect(err).toBeInstanceOf(BinaryFrameError);
        expect((err as BinaryFrameError).code).toBe("UNKNOWN_FORMAT");
      }
    });

    it("throws BinaryFrameError for unknown format byte", () => {
      const buffer = new Uint8Array([0x00, 0x01, 0x02]); // 0x00 is invalid
      expect(() => decodeBinaryFrame(buffer)).toThrow(BinaryFrameError);
      try {
        decodeBinaryFrame(buffer);
      } catch (err) {
        expect(err).toBeInstanceOf(BinaryFrameError);
        expect((err as BinaryFrameError).code).toBe("UNKNOWN_FORMAT");
        expect((err as BinaryFrameError).message).toContain("0x00");
      }
    });

    it("throws for format byte 0x04 (reserved)", () => {
      const buffer = new Uint8Array([0x04, 0x01, 0x02]);
      expect(() => decodeBinaryFrame(buffer)).toThrow(BinaryFrameError);
      try {
        decodeBinaryFrame(buffer);
      } catch (err) {
        expect((err as BinaryFrameError).code).toBe("UNKNOWN_FORMAT");
      }
    });

    it("throws for format byte 0xFF (reserved)", () => {
      const buffer = new Uint8Array([0xff, 0x01, 0x02]);
      expect(() => decodeBinaryFrame(buffer)).toThrow(BinaryFrameError);
    });

    it("accepts format 0x02 (BINARY_UPLOAD)", () => {
      const buffer = new Uint8Array([BinaryFormat.BINARY_UPLOAD, 0x01, 0x02]);
      const result = decodeBinaryFrame(buffer);
      expect(result.format).toBe(BinaryFormat.BINARY_UPLOAD);
      expect(result.payload).toEqual(new Uint8Array([0x01, 0x02]));
    });

    it("accepts format 0x03 (COMPRESSED_JSON)", () => {
      const buffer = new Uint8Array([BinaryFormat.COMPRESSED_JSON, 0x01, 0x02]);
      const result = decodeBinaryFrame(buffer);
      expect(result.format).toBe(BinaryFormat.COMPRESSED_JSON);
      expect(result.payload).toEqual(new Uint8Array([0x01, 0x02]));
    });
  });

  describe("decodeJsonFrame", () => {
    it("round-trips a simple object", () => {
      const original = {
        type: "request",
        id: "test-123",
        data: { foo: "bar" },
      };
      const encoded = encodeJsonFrame(original);
      const decoded = decodeJsonFrame(encoded);
      expect(decoded).toEqual(original);
    });

    it("round-trips UTF-8 content", () => {
      const original = { emoji: "👋🌍🎉", japanese: "こんにちは" };
      const encoded = encodeJsonFrame(original);
      const decoded = decodeJsonFrame(encoded);
      expect(decoded).toEqual(original);
    });

    it("round-trips complex nested structure", () => {
      const original = {
        type: "response",
        id: "resp-1",
        status: 200,
        body: {
          users: [
            { id: 1, name: "Alice" },
            { id: 2, name: "Bob" },
          ],
          meta: { total: 2, page: 1 },
        },
      };
      const encoded = encodeJsonFrame(original);
      const decoded = decodeJsonFrame(encoded);
      expect(decoded).toEqual(original);
    });

    it("throws BinaryFrameError for wrong format byte", () => {
      const buffer = new Uint8Array([BinaryFormat.BINARY_UPLOAD, 0x01, 0x02]);
      expect(() => decodeJsonFrame(buffer)).toThrow(BinaryFrameError);
      try {
        decodeJsonFrame(buffer);
      } catch (err) {
        expect(err).toBeInstanceOf(BinaryFrameError);
        expect((err as BinaryFrameError).code).toBe("UNKNOWN_FORMAT");
        expect((err as BinaryFrameError).message).toContain(
          "Expected JSON format",
        );
      }
    });

    it("throws BinaryFrameError for invalid UTF-8", () => {
      // Create a frame with format byte 0x01 but invalid UTF-8 payload
      const buffer = new Uint8Array([BinaryFormat.JSON, 0xff, 0xfe]);
      expect(() => decodeJsonFrame(buffer)).toThrow(BinaryFrameError);
      try {
        decodeJsonFrame(buffer);
      } catch (err) {
        expect(err).toBeInstanceOf(BinaryFrameError);
        expect((err as BinaryFrameError).code).toBe("INVALID_UTF8");
      }
    });

    it("throws BinaryFrameError for invalid JSON", () => {
      const payload = new TextEncoder().encode("not valid json {");
      const buffer = new Uint8Array(1 + payload.length);
      buffer[0] = BinaryFormat.JSON;
      buffer.set(payload, 1);

      expect(() => decodeJsonFrame(buffer)).toThrow(BinaryFrameError);
      try {
        decodeJsonFrame(buffer);
      } catch (err) {
        expect(err).toBeInstanceOf(BinaryFrameError);
        expect((err as BinaryFrameError).code).toBe("INVALID_JSON");
      }
    });

    it("handles empty JSON object", () => {
      const original = {};
      const encoded = encodeJsonFrame(original);
      const decoded = decodeJsonFrame(encoded);
      expect(decoded).toEqual({});
    });

    it("handles empty JSON array", () => {
      const original: unknown[] = [];
      const encoded = encodeJsonFrame(original);
      const decoded = decodeJsonFrame(encoded);
      expect(decoded).toEqual([]);
    });
  });

  describe("isBinaryData", () => {
    it("returns false for strings", () => {
      expect(isBinaryData("hello")).toBe(false);
      expect(isBinaryData("")).toBe(false);
      expect(isBinaryData('{"type":"test"}')).toBe(false);
    });

    it("returns true for ArrayBuffer", () => {
      const buffer = new ArrayBuffer(10);
      expect(isBinaryData(buffer)).toBe(true);
    });

    it("returns true for Uint8Array", () => {
      const array = new Uint8Array([1, 2, 3]);
      expect(isBinaryData(array)).toBe(true);
    });

    it("returns true for Buffer (Node.js)", () => {
      const buffer = Buffer.from([1, 2, 3]);
      expect(isBinaryData(buffer)).toBe(true);
    });

    it("returns false for null", () => {
      expect(isBinaryData(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isBinaryData(undefined)).toBe(false);
    });

    it("returns false for numbers", () => {
      expect(isBinaryData(123)).toBe(false);
    });

    it("returns false for plain objects", () => {
      expect(isBinaryData({ type: "test" })).toBe(false);
    });

    it("returns false for arrays", () => {
      expect(isBinaryData([1, 2, 3])).toBe(false);
    });
  });

  describe("BinaryFormat constants", () => {
    it("has correct values", () => {
      expect(BinaryFormat.JSON).toBe(0x01);
      expect(BinaryFormat.BINARY_UPLOAD).toBe(0x02);
      expect(BinaryFormat.COMPRESSED_JSON).toBe(0x03);
    });
  });

  describe("BinaryFrameError", () => {
    it("has correct name", () => {
      const err = new BinaryFrameError("test message", "UNKNOWN_FORMAT");
      expect(err.name).toBe("BinaryFrameError");
    });

    it("has correct message", () => {
      const err = new BinaryFrameError("test message", "UNKNOWN_FORMAT");
      expect(err.message).toBe("test message");
    });

    it("has correct code", () => {
      const err = new BinaryFrameError("test message", "INVALID_UTF8");
      expect(err.code).toBe("INVALID_UTF8");
    });

    it("is instanceof Error", () => {
      const err = new BinaryFrameError("test", "UNKNOWN_FORMAT");
      expect(err).toBeInstanceOf(Error);
    });
  });
});

// =============================================================================
// Phase 1: Binary Encrypted Envelope Tests
// =============================================================================

describe("binary-envelope (Phase 1)", () => {
  describe("BinaryEnvelopeVersion constants", () => {
    it("has correct values", () => {
      expect(BinaryEnvelopeVersion.V1).toBe(0x01);
    });
  });

  describe("constants", () => {
    it("NONCE_LENGTH is 24", () => {
      expect(NONCE_LENGTH).toBe(24);
    });

    it("VERSION_LENGTH is 1", () => {
      expect(VERSION_LENGTH).toBe(1);
    });

    it("MIN_BINARY_ENVELOPE_LENGTH is correct", () => {
      // version (1) + nonce (24) + MAC (16) + format (1) = 42
      expect(MIN_BINARY_ENVELOPE_LENGTH).toBe(42);
    });
  });

  describe("prependFormatByte", () => {
    it("prepends format byte 0x01 to JSON payload", () => {
      const payload = new TextEncoder().encode('{"test":"data"}');
      const result = prependFormatByte(BinaryFormat.JSON, payload);

      expect(result[0]).toBe(BinaryFormat.JSON);
      expect(result.slice(1)).toEqual(payload);
    });

    it("prepends format byte 0x02 to binary payload", () => {
      const payload = new Uint8Array([0xff, 0xfe, 0xfd]);
      const result = prependFormatByte(BinaryFormat.BINARY_UPLOAD, payload);

      expect(result[0]).toBe(BinaryFormat.BINARY_UPLOAD);
      expect(result.slice(1)).toEqual(payload);
    });

    it("prepends format byte 0x03 to compressed payload", () => {
      const payload = new Uint8Array([0x1f, 0x8b, 0x08]); // gzip magic
      const result = prependFormatByte(BinaryFormat.COMPRESSED_JSON, payload);

      expect(result[0]).toBe(BinaryFormat.COMPRESSED_JSON);
      expect(result.slice(1)).toEqual(payload);
    });

    it("handles empty payload", () => {
      const payload = new Uint8Array(0);
      const result = prependFormatByte(BinaryFormat.JSON, payload);

      expect(result.length).toBe(1);
      expect(result[0]).toBe(BinaryFormat.JSON);
    });
  });

  describe("extractFormatAndPayload", () => {
    it("extracts format 0x01 and payload", () => {
      const data = new Uint8Array([BinaryFormat.JSON, 0x7b, 0x7d]); // 0x01 + "{}"
      const { format, payload } = extractFormatAndPayload(data);

      expect(format).toBe(BinaryFormat.JSON);
      expect(new TextDecoder().decode(payload)).toBe("{}");
    });

    it("extracts format 0x02 and binary payload", () => {
      const data = new Uint8Array([BinaryFormat.BINARY_UPLOAD, 0xff, 0xfe]);
      const { format, payload } = extractFormatAndPayload(data);

      expect(format).toBe(BinaryFormat.BINARY_UPLOAD);
      expect(payload).toEqual(new Uint8Array([0xff, 0xfe]));
    });

    it("throws for empty input", () => {
      const data = new Uint8Array(0);
      expect(() => extractFormatAndPayload(data)).toThrow(BinaryEnvelopeError);
      try {
        extractFormatAndPayload(data);
      } catch (err) {
        expect((err as BinaryEnvelopeError).code).toBe("INVALID_FORMAT");
      }
    });

    it("throws for unknown format byte", () => {
      const data = new Uint8Array([0x00, 0x01, 0x02]); // 0x00 is invalid
      expect(() => extractFormatAndPayload(data)).toThrow(BinaryEnvelopeError);
      try {
        extractFormatAndPayload(data);
      } catch (err) {
        expect((err as BinaryEnvelopeError).code).toBe("INVALID_FORMAT");
        expect((err as BinaryEnvelopeError).message).toContain("0x00");
      }
    });

    it("round-trips with prependFormatByte", () => {
      const original = new TextEncoder().encode('{"round":"trip"}');
      const withFormat = prependFormatByte(BinaryFormat.JSON, original);
      const { format, payload } = extractFormatAndPayload(withFormat);

      expect(format).toBe(BinaryFormat.JSON);
      expect(payload).toEqual(original);
    });
  });

  describe("createBinaryEnvelope", () => {
    it("creates envelope with correct structure", () => {
      const nonce = new Uint8Array(NONCE_LENGTH).fill(0x42);
      const ciphertext = new Uint8Array([0xaa, 0xbb, 0xcc]);

      const envelope = createBinaryEnvelope(nonce, ciphertext);
      const view = new Uint8Array(envelope);

      expect(view[0]).toBe(BinaryEnvelopeVersion.V1);
      expect(view.slice(VERSION_LENGTH, VERSION_LENGTH + NONCE_LENGTH)).toEqual(
        nonce,
      );
      expect(view.slice(VERSION_LENGTH + NONCE_LENGTH)).toEqual(ciphertext);
    });

    it("uses provided version", () => {
      const nonce = new Uint8Array(NONCE_LENGTH);
      const ciphertext = new Uint8Array([0x00]);

      const envelope = createBinaryEnvelope(
        nonce,
        ciphertext,
        BinaryEnvelopeVersion.V1,
      );
      const view = new Uint8Array(envelope);

      expect(view[0]).toBe(0x01);
    });

    it("throws for wrong nonce length", () => {
      const shortNonce = new Uint8Array(16);
      const ciphertext = new Uint8Array([0x00]);

      expect(() => createBinaryEnvelope(shortNonce, ciphertext)).toThrow(
        BinaryEnvelopeError,
      );
    });

    it("handles large ciphertext", () => {
      const nonce = new Uint8Array(NONCE_LENGTH);
      const ciphertext = new Uint8Array(100000).fill(0xab);

      const envelope = createBinaryEnvelope(nonce, ciphertext);
      expect(envelope.byteLength).toBe(VERSION_LENGTH + NONCE_LENGTH + 100000);
    });
  });

  describe("parseBinaryEnvelope", () => {
    it("parses valid envelope", () => {
      const nonce = new Uint8Array(NONCE_LENGTH).fill(0x42);
      // Ciphertext needs to be at least 17 bytes (16 MAC + 1 format byte minimum)
      const ciphertext = new Uint8Array(17).fill(0xaa);
      const envelope = createBinaryEnvelope(nonce, ciphertext);

      const parsed = parseBinaryEnvelope(envelope);

      expect(parsed.version).toBe(BinaryEnvelopeVersion.V1);
      expect(parsed.nonce).toEqual(nonce);
      expect(parsed.ciphertext).toEqual(ciphertext);
    });

    it("works with Uint8Array input", () => {
      const nonce = new Uint8Array(NONCE_LENGTH).fill(0x11);
      // Ciphertext needs to be at least 17 bytes (16 MAC + 1 format byte minimum)
      const ciphertext = new Uint8Array(17).fill(0x22);
      const envelope = createBinaryEnvelope(nonce, ciphertext);

      const parsed = parseBinaryEnvelope(new Uint8Array(envelope));

      expect(parsed.version).toBe(BinaryEnvelopeVersion.V1);
      expect(parsed.nonce).toEqual(nonce);
    });

    it("throws for too-short envelope", () => {
      const tooShort = new ArrayBuffer(MIN_BINARY_ENVELOPE_LENGTH - 1);
      expect(() => parseBinaryEnvelope(tooShort)).toThrow(BinaryEnvelopeError);
      try {
        parseBinaryEnvelope(tooShort);
      } catch (err) {
        expect((err as BinaryEnvelopeError).code).toBe("INVALID_LENGTH");
      }
    });

    it("throws for unknown version byte", () => {
      // Create valid-length envelope with wrong version
      const buffer = new ArrayBuffer(MIN_BINARY_ENVELOPE_LENGTH);
      const view = new Uint8Array(buffer);
      view[0] = 0x02; // Invalid version

      expect(() => parseBinaryEnvelope(buffer)).toThrow(BinaryEnvelopeError);
      try {
        parseBinaryEnvelope(buffer);
      } catch (err) {
        expect((err as BinaryEnvelopeError).code).toBe("UNKNOWN_VERSION");
        expect((err as BinaryEnvelopeError).message).toContain("0x02");
      }
    });

    it("throws for version 0x00", () => {
      const buffer = new ArrayBuffer(MIN_BINARY_ENVELOPE_LENGTH);
      const view = new Uint8Array(buffer);
      view[0] = 0x00;

      expect(() => parseBinaryEnvelope(buffer)).toThrow(BinaryEnvelopeError);
    });

    it("round-trips with createBinaryEnvelope", () => {
      const nonce = new Uint8Array(NONCE_LENGTH);
      // Fill with pseudo-random values
      for (let i = 0; i < NONCE_LENGTH; i++) {
        nonce[i] = (i * 7) % 256;
      }
      const ciphertext = new Uint8Array([
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c,
        0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17,
      ]);

      const envelope = createBinaryEnvelope(nonce, ciphertext);
      const parsed = parseBinaryEnvelope(envelope);

      expect(parsed.version).toBe(BinaryEnvelopeVersion.V1);
      expect(parsed.nonce).toEqual(nonce);
      expect(parsed.ciphertext).toEqual(ciphertext);
    });
  });

  describe("BinaryEnvelopeError", () => {
    it("has correct name", () => {
      const err = new BinaryEnvelopeError("test", "UNKNOWN_VERSION");
      expect(err.name).toBe("BinaryEnvelopeError");
    });

    it("has correct message", () => {
      const err = new BinaryEnvelopeError("custom message", "INVALID_LENGTH");
      expect(err.message).toBe("custom message");
    });

    it("has correct code", () => {
      const err = new BinaryEnvelopeError("test", "DECRYPTION_FAILED");
      expect(err.code).toBe("DECRYPTION_FAILED");
    });

    it("is instanceof Error", () => {
      const err = new BinaryEnvelopeError("test", "INVALID_FORMAT");
      expect(err).toBeInstanceOf(Error);
    });
  });
});
