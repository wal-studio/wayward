# Analysis artifacts

All files in this directory are generated outputs tied to the exact source path, SHA-256, and HEAD recorded in `MANIFEST.json`. They are evidence for that run, not a permanent development baseline.

The current workflow selects the source dynamically from the current push or explicit workflow_dispatch input. Historical manifests, chunk names, function indexes, and UI contexts remain unchanged as provenance; they must not be reused as the current source map or patch target.

The generic analysis pipeline is the default. Historical minified-symbol target contexts run only when `include_legacy_mobile_targets=true` is explicitly selected. Verify all symbols against the selected source before use.
