// NaCl encryption helpers (JSON envelope format)
export {
  NONCE_LENGTH,
  KEY_LENGTH,
  generateNonce,
  encrypt,
  decrypt,
  deriveSecretboxKey,
  generateRandomKey,
  // Binary envelope format (Phase 1)
  encryptToBinaryEnvelope,
  encryptBytesToBinaryEnvelope,
  decryptBinaryEnvelope,
  decryptBinaryEnvelopeRaw,
} from "./nacl-wrapper.js";

// SRP server helpers
export { generateVerifier, SrpServerSession } from "./srp-server.js";
