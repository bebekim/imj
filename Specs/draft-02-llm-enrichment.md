# imj LLM Enrichment Spec

Status: v1 draft, out of scope for v0.

## Intent

LLM enrichment adds metadata to songs already stored in SQLite. It should not be required for basic playlist creation, export, or playback.

## Confirmed Direction

- Enrichment is manual through an `enrich` command, not automatic on `add`.
- Existing enriched metadata may be overwritten.
- Try `https://github.com/cactus-compute/needle` first.
- Setup should eventually configure API credentials or provider settings.

## Candidate CLI

```bash
imj enrich PLAYLIST
imj enrich-url URL
```

## Candidate Fields

- title
- artist
- album
- duration
- source platform

## Open Questions

- Which provider and model should be used through Needle?
- How is the API key configured?
- Should enrichment inspect only the URL string, fetch page metadata, or use another tool?
- What should happen when enrichment fails for one URL?
- Should partial enrichment results be saved?
- Should enriched titles be shortened for display, and if so by what rule?
- Should v1 include inferred playback, such as `imj play radiohead`, where the LLM builds a temporary playlist from existing songs?
