# Legacy mobile target contexts

This directory contains outputs from the former minified-symbol targeting pipeline. The recorded symbols and contexts were generated against the exact source identified in the adjacent `analysis_parts/MANIFEST.json`; they are historical evidence only, not a current source map or default patch target.

The current analysis workflow does not regenerate these files by default. To regenerate legacy target contexts intentionally, dispatch the workflow with `include_legacy_mobile_targets=true`, then verify every symbol against the selected source before relying on it.

Do not infer replacement symbols from missing entries, and do not use these historical outputs as the baseline for a new task.
