# Server-Side Rendering for Mobile Performance

## Problem

The mobile client has performance issues that degrade the user experience:

1. **Streaming doesn't stream**: `react-markdown` parses the entire text on every chunk, which is slow enough on mobile that React batches all updates until streaming completes.

2. **Large client bundle**: Libraries like `react-syntax-highlighter` (Prism-based) and `react-markdown` add significant bundle size.

3. **Inconsistent diff display**: Pending edits show verbose "all removed, then all added" format, while completed edits show compact unified diffs with context lines (because the SDK computes `structuredPatch` for results but not for pending tool_use).

4. **Highlighting limitations**: Client-side Prism has a 1000-line limit to avoid blocking the main thread.

## Goal

Offload expensive computation to the server so the mobile client:
- Receives pre-rendered, ready-to-display content
- Has minimal JavaScript bundle
- Maintains responsive UI during streaming
- Shows consistent, high-quality rendering

## Solution: Server-Side Augments

The server will compute "augments" - pre-rendered presentation data - and send them alongside SDK messages. SDK message types stay unchanged; augments are a separate data channel.

### Augment Types

| Content Type | Augment Data |
|--------------|--------------|
| Edit tool_use (pending) | `structuredPatch`, highlighted diff HTML |
| Edit tool_result | Highlighted diff HTML |
| Read tool_result | Highlighted file content HTML |
| Text blocks | Rendered markdown HTML |

### Libraries (Server-Side)

- **diff** (jsdiff): Compute `structuredPatch` for pending edits
- **shiki**: Syntax highlighting with TextMate grammars (VS Code quality)
- **TBD**: Markdown rendering (marked, micromark, or remark)

### Data Flow

#### Live Streaming (SSE)

Augments are sent **before** the SDK message they augment, so rendering data is ready when the message arrives:

```
SSE: { event: "augment", data: { toolUseId: "abc", type: "edit", ... } }
SSE: { event: "message", data: <SDK tool_use message> }
```

Client merges augments by `toolUseId`. If augment arrives late, client can re-render.

#### Persisted Sessions (REST)

Augments are included in the session response:

```json
{
  "session": { ... },
  "messages": [ ... ],
  "augments": {
    "toolUseId1": { "type": "edit", "structuredPatch": [...], "html": "..." },
    "toolUseId2": { "type": "read", "html": "..." }
  }
}
```

### Client Changes

1. **Consume augments**: Store in context/state, keyed by `toolUseId`
2. **Render HTML directly**: Use `dangerouslySetInnerHTML` for pre-rendered content
3. **Remove client libraries**: Eventually remove `react-syntax-highlighter`, `diff` from client
4. **Fallback**: If augment missing, render plain text (no client-side processing)

### Server Changes

1. **Augment service**: Computes diffs, syntax highlighting, markdown rendering
2. **stream.ts**: Intercept messages, compute augments, send augment before message
3. **sessions.ts**: Compute augments for all messages in GET response
4. **Caching**: Cache augments for persisted sessions (optional optimization)

## Implementation Phases

### Phase 1: Edit Tool Diffs

- Add `diff` and `shiki` to server
- Create augment service with `computeEditAugment()`
- Wire into `stream.ts` for live sessions
- Wire into `sessions.ts` for persisted sessions
- Update `EditRenderer.tsx` to consume augments
- Consistent unified diff display for pending and completed edits

### Phase 2: File Viewer (Read Tool)

- Add `computeReadAugment()` to augment service
- Update `ReadRenderer.tsx` and `FileViewer.tsx`
- Remove 1000-line highlighting limit

### Phase 3: Markdown Rendering

- Add markdown renderer to augment service (marked or micromark)
- Handle streaming: render complete paragraphs/blocks, buffer incomplete ones
- Update `TextBlock.tsx` to render pre-rendered HTML
- Support file path detection server-side

### Phase 4: Cleanup

- Remove `react-syntax-highlighter` from client
- Remove `react-markdown` from client
- Remove `diff` from client
- Measure bundle size reduction

## Open Questions

1. **Shiki theme output**: Should server output themed HTML (with colors), or semantic classes that client CSS themes? Semantic classes are more flexible for light/dark mode.

2. **Markdown streaming**: How to handle incomplete markdown during streaming? Options:
   - Buffer until complete block, then render
   - Send raw text for current block, re-send rendered when complete
   - Render incrementally with fixups

3. **Augment caching**: Should we cache augments to disk for persisted sessions? Pros: faster subsequent loads. Cons: cache invalidation, storage.

4. **Language detection**: When file extension is unknown, how to detect language for highlighting? Shiki doesn't auto-detect. Options: heuristics, fall back to plain text.

5. **Partial file highlighting**: For diff hunks without full file context, will Shiki handle multi-line constructs (strings, comments) correctly? The context lines in `structuredPatch` should help, but edge cases may exist.

6. **Error handling**: If augment computation fails, what to show? Probably fall back to plain text with no highlighting.

## Testing Strategy

This architecture is highly testable:

- **Unit tests**: Augment service functions (diff computation, highlighting) in isolation
- **Integration tests**: End-to-end augment flow through SSE and REST endpoints
- **Snapshot tests**: Verify highlighted output doesn't regress
- **Performance tests**: Measure augment computation time, ensure it doesn't delay message delivery

## Success Metrics

- Streaming text actually streams on mobile (visual updates during stream)
- Client bundle size reduced by ~200-300KB (react-markdown, react-syntax-highlighter, Prism)
- Consistent diff display between pending and completed edits
- File viewer can handle files >1000 lines with highlighting
