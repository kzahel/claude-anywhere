/**
 * Augments module - Server-side markdown rendering for streaming
 *
 * This module provides components for rendering markdown blocks as they
 * stream in from Claude, enabling progressive HTML rendering with
 * syntax-highlighted code blocks.
 */

// Block detection
export { BlockDetector, type CompletedBlock } from "./block-detector.js";

// Augment generation
export {
  type Augment,
  type AugmentGenerator,
  type AugmentGeneratorConfig,
  createAugmentGenerator,
} from "./augment-generator.js";

// Stream coordination (combines block detection and augment generation)
export {
  type StreamChunkResult,
  type StreamCoordinator,
  createStreamCoordinator,
} from "./stream-coordinator.js";
