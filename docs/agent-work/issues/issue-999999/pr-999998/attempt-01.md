# Synthetic delivery-evidence example

This example documents the version 1 format only. It refers to no actual
Butterbox issue, pull request, merge, acceptance result or test execution.

The JSON file is the machine-readable record. The canonical GitHub issue is the
live delivery record; the reconciler adds the observed merge SHA and actual
required-check outcomes there. Leave `mergeSha` as `null` before merge rather
than guessing it. Each rerun gets a new attempt directory and does not replace
earlier evidence.

Validate a real attempt with:

```sh
node tools/agent-evidence/evidence.mjs --file docs/agent-work/issues/issue-N/pr-N/attempt-NN.evidence.json --repo farbotkol/butterbox
```
