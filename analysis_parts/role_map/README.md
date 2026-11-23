# Historical role-map output

The role files in this directory are generated evidence tied to the source and run manifest that produced them. The current contents predate the generalized source selector and are not a current source map or development baseline.

The current role-map generator selects an explicit source path and uses semantic text rules by default. Minified-symbol rules from older bundles are included only when `include_legacy_mobile_targets=true` is explicitly selected in workflow_dispatch.

Regenerate before relying on this directory. Verify the manifest source path, SHA-256, and HEAD first.
