/**
 * Augments module - Server-side rendering for streaming content
 *
 * This module provides components for:
 * - Rendering markdown blocks as they stream in from Claude
 * - Computing edit augments with unified diff and syntax highlighting
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

// Edit augments (unified diff computation and highlighting)
export {
  computeEditAugment,
  type EditInput,
} from "./edit-augments.js";
