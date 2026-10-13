/** Frozen test design v1. Component passes never count as aggregate acceptance. */
const freeze = value => { if (value && typeof value === 'object') { for (const x of Object.values(value)) freeze(x); Object.freeze(value); } return value; };
export const suites = freeze({
  "contracts": {
    "positives": null,
    "file": "contracts.test.js",
    "cases": [
      "C01",
      "C02",
      "C03"
    ],
    "integration": false,
    "variants": {
      "C01": [
        "C01/roundtrip",
        "C01/closed-negative",
        "C01/restore-state"
      ],
      "C02": [
        "C02/bounds",
        "C02/graph",
        "C02/overflow"
      ],
      "C03": [
        "C03/controls",
        "C03/service-separation",
        "C03/borrowed-owner"
      ]
    }
  },
  "authority": {
    "positives": ["read", "deny"],
    "file": "authority.test.js",
    "cases": [
      "A01",
      "A02",
      "A03",
      "A04",
      "A05",
      "A06"
    ],
    "integration": true,
    "variants": {
      "A01": [
        "A01/same-scope",
        "A01/shared-source",
        "A01/cross-tenant-denied",
        "A01/share-forward-first",
        "A01/share-reverse-first"
      ],
      "A02": [
        "A02/private-group-denied",
        "A02/full-audience",
        "A02/guest-denied",
        "A02/permitted-group"
      ],
      "A03": [
        "A03/forgery",
        "A03/source-payer-revoked",
        "A03/destination-payer-revoked",
        "A03/membership-revoked",
        "A03/space-revoked",
        "A03/session-expiry-after-lock",
        "A03/token-expiry-after-effects",
        "A03/share-forward-first",
        "A03/share-reverse-first"
      ],
      "A04": [
        "A04/role-ownership",
        "A04/forced-rls",
        "A04/direct-worker-denied",
        "A04/direct-idp-denied",
        "A04/public-denied",
        "A04/cross-scope-denied"
      ],
      "A05": [
        "A05/authority-offline",
        "A05/cache-offline",
        "A05/save-offline",
        "A05/derived-offline",
        "A05/restore-offline",
        "A05/authority-recovered"
      ],
      "A06": [
        "A06/reader-denied",
        "A06/contributor-denied",
        "A06/operator-allowed",
        "A06/grant-revoked-after-wait",
        "A06/policy-extension-denied"
      ]
    }
  },
  "owned-encryption": {
    "positives": ["write", "read", "deny"],
    "file": "owned-encryption.test.js",
    "cases": [
      "E01",
      "E02",
      "E03",
      "E04"
    ],
    "integration": true,
    "variants": {
      "E01": [
        "E01/all-classes",
        "E01/recreated-reader",
        "E01/exact-binary"
      ],
      "E02": [
        "E02/body",
        "E02/tag",
        "E02/nonce",
        "E02/truncated",
        "E02/algorithm",
        "E02/version",
        "E02/tenant",
        "E02/space",
        "E02/class",
        "E02/id",
        "E02/revision",
        "E02/generation",
        "E02/key-id",
        "E02/wrong-key",
        "E02/missing-key",
        "E02/original-allowed"
      ],
      "E03": [
        "E03/pg-all-retained",
        "E03/files-archives",
        "E03/logs-streams",
        "E03/native-model-task",
        "E03/every-inventoried-field"
      ],
      "E04": [
        "E04/same-value-different-scopes",
        "E04/scope-keyed-fingerprint",
        "E04/wrong-scope-key",
        "E04/key-export-denied"
      ]
    }
  },
  "commit-conflict": {
    "positives": ["save", "conflict", "owner"],
    "file": "commit-conflict.test.js",
    "cases": [
      "K01",
      "K02",
      "K03",
      "K04",
      "K05",
      "K06",
      "K07",
      "K08",
      "K09"
    ],
    "integration": true,
    "variants": {
      "K01": [
        "K01/assertion",
        "K01/registered-check",
        "K01/correction",
        "K01/unrelated-survives",
        "K01/recreated-history"
      ],
      "K02": [
        "K02/discussion",
        "K02/proposal",
        "K02/proposal-repeated",
        "K02/disputed",
        "K02/forged-check",
        "K02/secret",
        "K02/indefinite-retention",
        "K02/explicit-save"
      ],
      "K03": [
        "K03/kill-revision",
        "K03/kill-head",
        "K03/kill-receipt",
        "K03/kill-event",
        "K03/kill-outbox",
        "K03/committed-recreated",
        "K03/response-after-commit"
      ],
      "K04": [
        "K04/kill-staged",
        "K04/kill-file-fsynced",
        "K04/kill-renamed",
        "K04/kill-directory-fsynced",
        "K04/kill-manifest-confirmed",
        "K04/kill-before-publication",
        "K04/kill-after-publication",
        "K04/corrupt-published"
      ],
      "K05": [
        "K05/active-lease",
        "K05/published-reachable",
        "K05/unknown-protected",
        "K05/expired-orphan",
        "K05/gc-stage-first",
        "K05/gc-publish-first",
        "K05/kill-gc",
        "K05/unowned-sentinel"
      ],
      "K06": [
        "K06/same-key-identical-concurrent",
        "K06/same-key-changed-concurrent",
        "K06/recreated-retry",
        "K06/exact-effect-counts"
      ],
      "K07": [
        "K07/observed-commit-wait",
        "K07/observed-rollback-wait",
        "K07/observed-timeout",
        "K07/lost-commit-ack",
        "K07/serialized-absence-no-replay"
      ],
      "K08": [
        "K08/writer-a-wins",
        "K08/writer-b-wins",
        "K08/recreated-loser",
        "K08/independent-facts-both-succeed"
      ],
      "K09": [
        "K09/no-control-promotion",
        "K09/no-method-release",
        "K09/no-check-authority",
        "K09/archive-no-authority"
      ]
    }
  },
  "recall-ask": {
    "positives": ["ask", "deny", "owner"],
    "file": "recall-ask.test.js",
    "cases": [
      "Q01",
      "Q02",
      "Q03",
      "Q04",
      "Q05",
      "Q06",
      "Q07",
      "Q08",
      "Q09"
    ],
    "integration": true,
    "variants": {
      "Q01": [
        "Q01/persisted-random-decision",
        "Q01/changed-value",
        "Q01/recreated-service",
        "Q01/no-computer"
      ],
      "Q02": [
        "Q02/full-audience-eligible",
        "Q02/unauthorized-no-decrypt",
        "Q02/proposal-excluded",
        "Q02/stale-excluded",
        "Q02/disputed-uncertain",
        "Q02/evidence-gap"
      ],
      "Q03": [
        "Q03/index-unavailable-exact",
        "Q03/index-lag-tail",
        "Q03/current-overlay",
        "Q03/cache-version-bound"
      ],
      "Q04": [
        "Q04/forget-before-disclosure",
        "Q04/forget-after-disclosure",
        "Q04/source-revoke-before-disclosure",
        "Q04/source-revoke-after-disclosure",
        "Q04/membership-remove-before-disclosure",
        "Q04/membership-remove-after-disclosure",
        "Q04/correction-before-disclosure",
        "Q04/correction-after-disclosure",
        "Q04/remaining-member-allowed"
      ],
      "Q05": [
        "Q05/allowed",
        "Q05/denied",
        "Q05/index-unavailable",
        "Q05/service-failure",
        "Q05/concurrent",
        "Q05/restored",
        "Q05/live-inspection-denied",
        "Q05/no-fallback-ports"
      ],
      "Q06": [
        "Q06/controls-000",
        "Q06/controls-001",
        "Q06/controls-010",
        "Q06/controls-011",
        "Q06/controls-100",
        "Q06/controls-101",
        "Q06/controls-110",
        "Q06/controls-111",
        "Q06/file-grants-independent",
        "Q06/group-personal-export-denied"
      ],
      "Q07": [
        "Q07/immutable-session-space",
        "Q07/foreign-session-denied",
        "Q07/queued-space-switch",
        "Q07/billing-no-merge"
      ],
      "Q08": [
        "Q08/installed-native-owner",
        "Q08/installed-resource-owner",
        "Q08/budget-denied-before-disclosure",
        "Q08/same-key-single-charge",
        "Q08/stopped",
        "Q08/replacement",
        "Q08/unknown-effect",
        "Q08/no-plaintext-model-history"
      ],
      "Q09": [
        "Q09/safe-denial",
        "Q09/live-state-unsupported",
        "Q09/evidence-gap-guidance",
        "Q09/no-restricted-diagnostics"
      ]
    }
  },
  "lifecycle-propagation": {
    "positives": ["forget", "propagate", "deny", "owner"],
    "file": "lifecycle-propagation.test.js",
    "cases": [
      "L01",
      "L02",
      "L03",
      "L04",
      "L05",
      "L06",
      "L07",
      "L08",
      "L09"
    ],
    "integration": true,
    "variants": {
      "L01": [
        "L01/every-class-expiry",
        "L01/expiry-read",
        "L01/expiry-publication",
        "L01/durable-tombstone"
      ],
      "L02": [
        "L02/durable-forget",
        "L02/repeat-forget",
        "L02/active-derived-counts",
        "L02/delivered-not-recalled",
        "L02/pending-retry"
      ],
      "L03": [
        "L03/source-revoke-before-disclosure",
        "L03/source-revoke-after-disclosure",
        "L03/membership-remove-before-disclosure",
        "L03/membership-remove-after-disclosure",
        "L03/remaining-member-allowed",
        "L03/cache-blocked"
      ],
      "L04": [
        "L04/nested-descendants",
        "L04/unaffected-branch",
        "L04/cycle-denied",
        "L04/missing-ancestor",
        "L04/depth-bound",
        "L04/fanout-bound",
        "L04/correction-current"
      ],
      "L05": [
        "L05/delete-restriction-first",
        "L05/delete-publication-first",
        "L05/expiry-restriction-first",
        "L05/expiry-publication-first",
        "L05/source-revoke-restriction-first",
        "L05/source-revoke-publication-first",
        "L05/correction-restriction-first",
        "L05/correction-publication-first",
        "L05/worker-restart",
        "L05/duplicate-job"
      ],
      "L06": [
        "L06/kill-invalidation-persisted",
        "L06/kill-descendant-written",
        "L06/kill-watermark",
        "L06/durable-pending",
        "L06/recreated-retry"
      ],
      "L07": [
        "L07/delete-restriction-first",
        "L07/delete-publication-first",
        "L07/expiry-restriction-first",
        "L07/expiry-publication-first",
        "L07/source-revoke-restriction-first",
        "L07/source-revoke-publication-first",
        "L07/correction-restriction-first",
        "L07/correction-publication-first",
        "L07/session-expiry-after-lock",
        "L07/member-expiry-after-lock",
        "L07/share-forward-first",
        "L07/share-reverse-first",
        "L07/kill-publication"
      ],
      "L08": [
        "L08/late-summary-old-revision",
        "L08/late-index",
        "L08/late-cache",
        "L08/canonical-preserved",
        "L08/stop-retains-storage"
      ],
      "L09": [
        "L09/summary-admission",
        "L09/index-admission",
        "L09/cache-admission",
        "L09/budget-denied",
        "L09/blocked-wait-revalidation",
        "L09/duplicate-single-charge"
      ]
    }
  },
  "volume-draft": {
    "positives": ["write", "read", "conflict"],
    "file": "volume-draft.test.js",
    "cases": [
      "V01",
      "V02",
      "V03",
      "V04",
      "V05"
    ],
    "integration": true,
    "variants": {
      "V01": [
        "V01/live-written",
        "V01/draft-saved",
        "V01/checkpoint-confirmed",
        "V01/canonical-committed",
        "V01/unsaved-lost",
        "V01/kill-live-fsync",
        "V01/kill-checkpoint-confirmation"
      ],
      "V02": [
        "V02/promoter-a-wins",
        "V02/promoter-b-wins",
        "V02/recreated-loser",
        "V02/validated-promotion"
      ],
      "V03": [
        "V03/recreated-saved-draft",
        "V03/stale-comparable",
        "V03/retain-variant",
        "V03/private-group-denied",
        "V03/guest-denied"
      ],
      "V04": [
        "V04/stop-fences-writer",
        "V04/replacement-fences-writer",
        "V04/space-switch-immutable",
        "V04/recreated-stale-writer",
        "V04/kill-before-publication"
      ],
      "V05": [
        "V05/exact-binary",
        "V05/manifest-binding",
        "V05/missing-byte-blocked",
        "V05/cross-scope-denied",
        "V05/checkpoint-not-knowledge-commit"
      ]
    }
  },
  "backup-restore": {
    "positives": ["backup", "restore", "read", "ask"],
    "file": "backup-restore.test.js",
    "cases": [
      "R01",
      "R02",
      "R03",
      "R04",
      "R05",
      "R06",
      "R07",
      "R08",
      "R09"
    ],
    "integration": true,
    "variants": {
      "R01": [
        "R01/actual-source-loss",
        "R01/fresh-root-restore",
        "R01/recreated-knowledge-read",
        "R01/recreated-artifact-read",
        "R01/saved-decision-ask",
        "R01/no-computer"
      ],
      "R02": [
        "R02/post-backup-forget",
        "R02/post-backup-expiry",
        "R02/post-backup-source-revoke",
        "R02/post-backup-membership-remove",
        "R02/post-backup-correction",
        "R02/restriction-during-wait",
        "R02/restriction-before-activation",
        "R02/stale-writer",
        "R02/unchanged-survivor"
      ],
      "R03": [
        "R03/authority-missing",
        "R03/authority-unavailable",
        "R03/authority-empty",
        "R03/authority-rolled-back",
        "R03/head-missing",
        "R03/epoch-anchor-missing",
        "R03/archive-authority-denied",
        "R03/current-authority-recovered"
      ],
      "R04": [
        "R04/kill-staged",
        "R04/kill-item-written",
        "R04/kill-inventory-validated",
        "R04/kill-metadata-imported",
        "R04/kill-restrictions-reconciled",
        "R04/kill-before-activation-commit",
        "R04/kill-after-activation-commit",
        "R04/concurrent-original-repeat",
        "R04/lost-activation-ack",
        "R04/observed-commit-wait",
        "R04/observed-rollback-wait",
        "R04/observed-timeout"
      ],
      "R05": [
        "R05/missing-item",
        "R05/truncated",
        "R05/tag",
        "R05/body",
        "R05/digest",
        "R05/length",
        "R05/reference",
        "R05/foreign-key",
        "R05/class",
        "R05/version",
        "R05/wrong-key",
        "R05/missing-key",
        "R05/traversal",
        "R05/symlink",
        "R05/sql",
        "R05/control-class",
        "R05/decoded-size-bound",
        "R05/file-count-bound",
        "R05/staged-item-replaced",
        "R05/fresh-target-aad"
      ],
      "R06": [
        "R06/no-external-replay",
        "R06/no-model-replay",
        "R06/no-computer-replay",
        "R06/no-credential-restore",
        "R06/no-approval-restore",
        "R06/no-method-restore",
        "R06/unsent-stays-unsent",
        "R06/forbidden-class-denied"
      ],
      "R07": [
        "R07/actual-monotonic-timing",
        "R07/class-byte-item-counts",
        "R07/last-backup-checkpoint",
        "R07/competing-reads-writes",
        "R07/interruption-measurements"
      ],
      "R08": [
        "R08/operator-journey",
        "R08/recovery-status",
        "R08/revoked-grant-denied",
        "R08/invalid-destination-denied",
        "R08/owned-cleanup",
        "R08/rollback-preserves-authority"
      ],
      "R09": [
        "R09/capture-first",
        "R09/writer-first",
        "R09/kill-inventory-fsync",
        "R09/kill-archive-fsync",
        "R09/lost-confirmation-ack",
        "R09/recreated-original-key",
        "R09/backup-expiry"
      ]
    }
  },
  "harness": {
    "positives": ["harness"],
    "file": "harness.test.js",
    "cases": [
      "H01",
      "H02",
      "H03",
      "H04"
    ],
    "integration": true,
    "variants": {
      "H01": [
        "H01/fresh-build",
        "H01/compiler-failure",
        "H01/deleted-source",
        "H01/stale-output",
        "H01/owner-emission",
        "H01/dependency-pins"
      ],
      "H02": [
        "H02/removed-suite",
        "H02/removed-case",
        "H02/empty-suite",
        "H02/failure",
        "H02/cancellation",
        "H02/skip",
        "H02/todo",
        "H02/forged-label",
        "H02/forged-totals",
        "H02/missing-variant",
        "H02/unknown-argument",
        "H02/good-full-run"
      ],
      "H03": [
        "H03/real-census",
        "H03/loopback",
        "H03/owned-child",
        "H03/cached-pg",
        "H03/census-denied",
        "H03/loopback-denied",
        "H03/pg-unavailable",
        "H03/child-cleanup-failed",
        "H03/root-cleanup-failed",
        "H03/container-cleanup-failed",
        "H03/symlink-cache",
        "H03/instance-substitution",
        "H03/guards-on-failure"
      ],
      "H04": [
        "H04/exact-executed-identities",
        "H04/missing-positive",
        "H04/unauthorized-disclosure",
        "H04/unauthorized-mutation",
        "H04/silent-lost-update",
        "H04/duplicate-canonical-effect",
        "H04/restricted-resurrection",
        "H04/ask-computer-start"
      ]
    }
  },
  "delivery-audit": {
    "positives": ["save", "ask", "forget", "restore"],
    "file": "delivery-audit.test.js",
    "cases": [
      "D01",
      "D02",
      "D03",
      "D04",
      "D05",
      "D06"
    ],
    "integration": true,
    "variants": {
      "D01": [
        "D01/documented-http-journey",
        "D01/package-plan-evidence-paths",
        "D01/requirements-case-matrix"
      ],
      "D02": [
        "D02/candidate-check-lock-binding",
        "D02/complete-controller-streams",
        "D02/pending-review-visible",
        "D02/historical-failures-retained"
      ],
      "D03": [
        "D03/all-fields-inventory",
        "D03/retention-inventory",
        "D03/operations-recovery",
        "D03/dependency-license-update",
        "D03/measured-boundary",
        "D03/rollback-limitations"
      ],
      "D04": [
        "D04/local-only-action-audit",
        "D04/exact-approval-gates",
        "D04/requirements-history",
        "D04/controller-owned-state",
        "D04/fault-gates-no-substitution"
      ],
      "D05": [
        "D05/X01",
        "D05/X02",
        "D05/X03",
        "D05/X04",
        "D05/X05",
        "D05/X06",
        "D05/X07",
        "D05/X08",
        "D05/X09",
        "D05/finite-profile-claim"
      ],
      "D06": [
        "D06/severe-finding-blocks",
        "D06/missing-current-acceptance-blocks",
        "D06/no-author-verdict"
      ]
    }
  }
});
export const components = freeze({
  "volume-promotion": {
  "positives": [
    "save",
    "write",
    "read",
    "conflict",
    "deny",
    "owner"
  ],
  "file": "components/volume-promotion.component.test.js",
  "cases": [
    "VOLUME-PROMOTION/behavior"
  ],
  "integration": true,
  "variants": {
    "VOLUME-PROMOTION/behavior": [
      "VOLUME-PROMOTION/migration",
      "VOLUME-PROMOTION/exact-canonical-bytes-manifest-recreation",
      "VOLUME-PROMOTION/promoter-a-wins-observed-CAS",
      "VOLUME-PROMOTION/promoter-b-wins-observed-CAS",
      "VOLUME-PROMOTION/stale-compare-retained-variant-and-path-binding",
      "VOLUME-PROMOTION/closed-command-and-scope-denials",
      "VOLUME-PROMOTION/validator-current-storage-and-atomic-rollback",
      "VOLUME-PROMOTION/Stop-fences-recreated-writer-keeps-comparable-draft",
      "VOLUME-PROMOTION/installed-Task-Run-cancellation-worker-fences",
      "VOLUME-PROMOTION/installed-runtime-generation-and-mode-fences",
      "VOLUME-PROMOTION/source-revocation-before-promotion-and-after-commit",
      "VOLUME-PROMOTION/unknown-ACK-exact-original-no-replay",
      "VOLUME-PROMOTION/membership-revocation-after-preparation"
    ]
  }
},
  "volume-drafts": {
    "positives": ["save", "write", "read", "conflict", "deny", "owner"],
    "file": "components/volume-drafts.component.test.js",
    "cases": ["VOLUME-DRAFTS/behavior"],
    "integration": true,
    "variants": {
      "VOLUME-DRAFTS/behavior": [
        "VOLUME-DRAFTS/actual-lost-COMMIT-ACK-original-recovery",
        "VOLUME-DRAFTS/migration",
        "VOLUME-DRAFTS/live-written-recreated-exact-bytes",
        "VOLUME-DRAFTS/draft-saved-recreated-exact-audience",
        "VOLUME-DRAFTS/checkpoint-confirmed-frozen-C1-excludes-live-C2",
        "VOLUME-DRAFTS/stale-comparison-and-explicit-retained-variant",
        "VOLUME-DRAFTS/editor-memory-has-no-receipt-and-closed-input",
        "VOLUME-DRAFTS/original-idempotency-and-kind-CAS",
        "VOLUME-DRAFTS/personal-group-guest-foreign-ownership-denied",
        "VOLUME-DRAFTS/concurrent-original-one-effect-and-live-CAS",
        "VOLUME-DRAFTS/logical-and-artifact-atomic-rollback",
        "VOLUME-DRAFTS/exact-checkpoint-byte-and-current-control-rechecks",
        "VOLUME-DRAFTS/source-revocation-blocks-recreated-draft",
        "VOLUME-DRAFTS/native-stop-denies-writes-preserves-eligible-read",
        "VOLUME-DRAFTS/forced-RLS-immutable-history",
      ]
    }
  },
  "artifact-publication": {
  "positives": [
    "save",
    "read",
    "write",
    "deny",
    "conflict",
    "owner"
  ],
  "file": "components/artifact-publication.component.test.js",
  "cases": [
    "ARTIFACT-PUBLICATION/behavior"
  ],
  "integration": true,
  "variants": {
    "ARTIFACT-PUBLICATION/behavior": [
      "ARTIFACT-PUBLICATION/migration",
      "ARTIFACT-PUBLICATION/atomic-publication",
      "ARTIFACT-PUBLICATION/recreated-exact-binary-and-manifest",
      "ARTIFACT-PUBLICATION/integrity-negatives",
      "ARTIFACT-PUBLICATION/schema-validation-and-scope",
      "ARTIFACT-PUBLICATION/partial-publication-rollback",
      "ARTIFACT-PUBLICATION/deferred-required-evidence",
      "ARTIFACT-PUBLICATION/concurrent-original-and-collector",
      "ARTIFACT-PUBLICATION/fsync-process-interruption",
      "ARTIFACT-PUBLICATION/pg-process-publication-interruption",
      "ARTIFACT-PUBLICATION/unknown-commit-and-recreated-lookup",
      "ARTIFACT-PUBLICATION/orphan-lease-quarantine-and-unowned",
      "ARTIFACT-PUBLICATION/expired-unknown-operation-protected",
      "ARTIFACT-PUBLICATION/posteffect-validator-and-manifest-refusal",
      "ARTIFACT-PUBLICATION/native-stop-retained-read",
      "ARTIFACT-PUBLICATION/current-source-revocation-and-membership",
      "ARTIFACT-PUBLICATION/forced-rls-narrow-function-and-history"
    ]
  }
},
  "contracts": {
    "positives": null,
    "file": "components/contracts.component.test.js",
    "cases": [
      "C01",
      "C02",
      "C03"
    ],
    "integration": false,
    "variants": {
      "C01": [
        "C01/roundtrip",
        "C01/closed-negative",
        "C01/restore-state"
      ],
      "C02": [
        "C02/bounds",
        "C02/graph",
        "C02/overflow"
      ],
      "C03": [
        "C03/controls",
        "C03/service-separation",
        "C03/borrowed-owner"
      ]
    }
  },
  "authority": {
    "positives": ["read", "deny", "owner"],
    "file": "components/authority.component.test.js",
    "cases": [
      "AUTHORITY/behavior"
    ],
    "integration": true,
    "variants": {"AUTHORITY/behavior": ["AUTHORITY/migration", "AUTHORITY/live-owners", "AUTHORITY/scope-negative", "AUTHORITY/database-roles", "AUTHORITY/grants-policy", "AUTHORITY/anchor-recovery", "AUTHORITY/expiry-after-wait", "AUTHORITY/remaining-audience", "AUTHORITY/restriction-session", "AUTHORITY/shared-live", "AUTHORITY/shared-negative", "AUTHORITY/shared-roles", "AUTHORITY/shared-current", "AUTHORITY/shared-lock-order", "AUTHORITY/shared-revocation", "AUTHORITY/accounting-ask", "AUTHORITY/accounting-maintenance", "AUTHORITY/accounting-rollback", "AUTHORITY/accounting-negative", "AUTHORITY/accounting-expiry-wait", "AUTHORITY/shared-accounting-order", "AUTHORITY/shared-accounting-grant-wait", "AUTHORITY/shared-accounting-dependencies", "AUTHORITY/maintenance-grant-wait", "AUTHORITY/epoch-publication", "AUTHORITY/epoch-rollback", "AUTHORITY/epoch-ack-gap", "AUTHORITY/epoch-wire-unknown", "AUTHORITY/epoch-wire-rollback", "AUTHORITY/epoch-journal-cas", "AUTHORITY/epoch-concurrency", "AUTHORITY/epoch-journal-integrity", "AUTHORITY/epoch-roles", "AUTHORITY/policy-publication", "AUTHORITY/policy-negative", "AUTHORITY/policy-rollback", "AUTHORITY/policy-ack-gap", "AUTHORITY/policy-wire-outcomes", "AUTHORITY/policy-concurrency", "AUTHORITY/policy-expiry", "AUTHORITY/policy-roles", "AUTHORITY/policy-current", "AUTHORITY/policy-admin-grant-wait", "AUTHORITY/source-publication", "AUTHORITY/source-negative", "AUTHORITY/source-rollback", "AUTHORITY/source-ack-gap", "AUTHORITY/source-wire-outcomes", "AUTHORITY/source-concurrency", "AUTHORITY/source-expiry", "AUTHORITY/source-roles", "AUTHORITY/source-grant-wait", "AUTHORITY/source-journal-branches", "AUTHORITY/tombstone-publication", "AUTHORITY/tombstone-negative", "AUTHORITY/tombstone-rollback", "AUTHORITY/tombstone-ack-gap", "AUTHORITY/tombstone-wire-outcomes", "AUTHORITY/tombstone-concurrency", "AUTHORITY/tombstone-expiry", "AUTHORITY/tombstone-roles", "AUTHORITY/tombstone-grant-wait", "AUTHORITY/tombstone-journal-branches", "AUTHORITY/tombstone-class-lineage", "AUTHORITY/forget-work-publication", "AUTHORITY/forget-work-negative", "AUTHORITY/forget-work-rollback", "AUTHORITY/forget-work-ack-gap", "AUTHORITY/forget-work-wire-outcomes", "AUTHORITY/forget-work-concurrency", "AUTHORITY/forget-work-expiry", "AUTHORITY/forget-work-roles", "AUTHORITY/forget-work-grant-wait", "AUTHORITY/forget-work-journal-branches", "AUTHORITY/forget-work-class-lineage", "AUTHORITY/forget-work-partial-write", "AUTHORITY/forget-work-original-isolation", "AUTHORITY/control-read-preparation", "AUTHORITY/control-read-audience", "AUTHORITY/control-read-audience-wait", "AUTHORITY/control-read-lineage", "AUTHORITY/control-read-pending-audience", "AUTHORITY/control-read-native-stop", "AUTHORITY/entity-read-preparation", "AUTHORITY/entity-read-audience", "AUTHORITY/entity-read-audience-wait", "AUTHORITY/entity-read-lineage", "AUTHORITY/entity-read-scope", "AUTHORITY/entity-read-expiry-wait", "AUTHORITY/entity-read-remaining-audience", "AUTHORITY/head-publication", "AUTHORITY/head-correction", "AUTHORITY/head-negative", "AUTHORITY/head-rollback", "AUTHORITY/head-partial-write", "AUTHORITY/head-ack-gap", "AUTHORITY/head-wire-outcomes", "AUTHORITY/head-concurrency", "AUTHORITY/head-expiry", "AUTHORITY/head-roles", "AUTHORITY/head-audience-wait", "AUTHORITY/head-restricted-reuse", "AUTHORITY/head-grant-wait", "AUTHORITY/head-journal-branches", "AUTHORITY/head-shared-controls", "AUTHORITY/share-publication", "AUTHORITY/share-publication-negative", "AUTHORITY/share-publication-anchor-loss", "AUTHORITY/share-publication-rollback", "AUTHORITY/share-publication-ack-gap", "AUTHORITY/share-publication-wire-outcomes", "AUTHORITY/share-publication-lock-order", "AUTHORITY/share-publication-expiry", "AUTHORITY/share-publication-roles", "AUTHORITY/share-publication-current-audience", "AUTHORITY/share-publication-source-restriction", "AUTHORITY/share-publication-journal-branches"]}
  },
  "migration": {
    "positives": ["owner"],
    "file": "components/migration.component.test.js",
    "cases": [
      "MIGRATION/behavior"
    ],
    "integration": true,
    "variants": {}
  },
  "encryption": {
    "positives": ["write", "read", "deny"],
    "file": "components/encryption.component.test.js",
    "cases": [
      "ENCRYPTION/behavior"
    ],
    "integration": true,
    "variants": {"ENCRYPTION/behavior": ["ENCRYPTION/roundtrip-nonce", "ENCRYPTION/capability-races", "ENCRYPTION/real-pg-file-copies", "ENCRYPTION/all-aad-dimensions", "ENCRYPTION/cipher-and-key-refusals", "ENCRYPTION/scoped-fingerprints", "ENCRYPTION/closed-input-and-bounds"]}
  },
  "staging": {
    "positives": ["write", "deny"],
    "file": "components/staging.component.test.js",
    "cases": [
      "STAGING/behavior"
    ],
    "integration": true,
    "variants": {"STAGING/behavior": ["STAGING/durable-confirmation-recreated", "STAGING/exact-empty-and-scoped-files", "STAGING/corrupt-missing-manifest-byte-key", "STAGING/leases-pending-unknown-orphan", "STAGING/gc-stage-first-observed-wait", "STAGING/gc-publication-first-observed-wait", "STAGING/gc-first-blocks-publication", "STAGING/partial-phase-and-quarantine-recovery", "STAGING/ownership-symlink-hardlink-cleanup-failures", "STAGING/real-cleanup-syscall-failure", "STAGING/owner-uncertain-ack-no-replay", "STAGING/verified-byte-snapshot", "STAGING/inspect-postread-confirmation-clears-bytes", "STAGING/inspect-owner-completion-clears-bytes", "STAGING/stage-confirmation-result-required", "STAGING/publication-postdecrypt-confirmation-required", "STAGING/publication-result-required-rollback", "STAGING/publication-posteffect-gc-observed-wait", "STAGING/authenticated-inspect-postread-material-refusal", "STAGING/authenticated-inspect-owner-final-refusal", "STAGING/retained-copies-no-content-keys", "STAGING/authenticated-preparation-migration", "STAGING/authenticated-preparation-exact-and-original", "STAGING/authenticated-preparation-boundaries", "STAGING/authenticated-preparation-current-generation-and-authority", "STAGING/authenticated-preparation-native-stop-and-purpose", "STAGING/authenticated-preparation-concurrent-original", "STAGING/authenticated-preparation-after-file-wait", "STAGING/authenticated-abandonment-migration", "STAGING/authenticated-abandonment-recreated-gc", "STAGING/authenticated-abandonment-boundaries-history", "STAGING/authenticated-abandonment-rollback-wire-outcomes", "STAGING/authenticated-abandonment-stage-first-observed-wait", "STAGING/authenticated-abandonment-gc-first-observed-wait", "STAGING/authenticated-abandonment-quarantine-recovery-authority", "STAGING/authenticated-abandonment-current-reachability", "STAGING/authenticated-abandonment-real-cleanup-failure", "STAGING/authenticated-abandonment-expiry-after-write", "STAGING/authenticated-recovery-expired-original", "STAGING/authenticated-recovery-stopped-native-no-resume", "STAGING/authenticated-recovery-current-authority-and-binding", "STAGING/authenticated-recovery-maintenance-grant-independent-of-write", "STAGING/authenticated-recovery-after-original-lock-wait", "STAGING/authenticated-recovery-stage-first-observed-wait", "STAGING/authenticated-recovery-first-blocks-original-stage", "STAGING/authenticated-recovery-rollback-and-wire-outcomes", "STAGING/authenticated-recovery-quarantine-authority-reachability", "STAGING/authenticated-witness-settled-pg-rollback", "STAGING/authenticated-witness-ack-gap-and-rollback-intent", "STAGING/authenticated-witness-enrollment-rollback-no-replay", "STAGING/authenticated-witness-files-scope-and-cas", "STAGING/authenticated-witness-ack-authority-and-gc-wait", "STAGING/authenticated-process-kill-allocated", "STAGING/authenticated-process-kill-object-written", "STAGING/authenticated-process-kill-object-fsynced", "STAGING/authenticated-process-kill-object-renamed", "STAGING/authenticated-process-kill-object-directory-fsynced", "STAGING/authenticated-process-kill-manifest-fsynced", "STAGING/authenticated-process-kill-manifest-renamed", "STAGING/authenticated-process-kill-manifest-directory-fsynced", "STAGING/authenticated-process-kill-confirmed", "STAGING/authenticated-process-kill-quarantine", "STAGING/authenticated-staged-head-exact", "STAGING/authenticated-staged-head-binding-and-bytes", "STAGING/authenticated-staged-head-terminal-refusal", "STAGING/authenticated-staged-head-posteffect-rollback", "STAGING/authenticated-staged-head-gc-and-original-waits", "STAGING/authenticated-staged-head-wire-outcomes", "STAGING/authenticated-staged-head-original-lock-postwait", "STAGING/authenticated-staged-head-confirmation-required", "STAGING/authenticated-staged-head-expiry-during-final-decrypt", "STAGING/consumed-head-recreated", "STAGING/consumed-head-marker-integrity", "STAGING/consumed-head-outcome-wait-freshness"]}
  },
  "source-content": {
    "positives": ["write", "read", "deny"],
    "file": "components/source-content.component.test.js",
    "cases": ["SOURCE-CONTENT/behavior"],
    "integration": true,
    "variants": {"SOURCE-CONTENT/behavior": ["SOURCE-CONTENT/migration", "SOURCE-CONTENT/exact-recreated-and-retained", "SOURCE-CONTENT/material-admission-boundaries", "SOURCE-CONTENT/roles-and-integrity", "SOURCE-CONTENT/same-transaction-envelope-refusals", "SOURCE-CONTENT/partial-rollback-and-original", "SOURCE-CONTENT/killed-partial-transaction", "SOURCE-CONTENT/postinsert-owner-change", "SOURCE-CONTENT/current-revocation", "SOURCE-CONTENT/concurrent-original", "SOURCE-CONTENT/wire-outcomes"]}
  },
  "atomic-save": {
    "positives": ["save", "read", "deny"],
    "file": "components/atomic-save.component.test.js",
    "cases": ["ATOMIC-SAVE/behavior"],
    "integration": true,
    "variants": {"ATOMIC-SAVE/behavior": ["ATOMIC-SAVE/migration", "ATOMIC-SAVE/explicit-source", "ATOMIC-SAVE/commit-boundary", "ATOMIC-SAVE/exact-recreated-read", "ATOMIC-SAVE/partial-rollback", "ATOMIC-SAVE/deferred-required-pieces", "ATOMIC-SAVE/admission-negative", "ATOMIC-SAVE/source-negative", "ATOMIC-SAVE/roles-and-immutability", "ATOMIC-SAVE/concurrent-original", "ATOMIC-SAVE/final-expiry", "ATOMIC-SAVE/current-source-revocation", "ATOMIC-SAVE/postcommit-ack-gap"]}
  },
  "knowledge-status": {
    "positives": ["save", "read", "write", "deny", "owner"],
    "file": "components/knowledge-status.component.test.js",
    "cases": ["KNOWLEDGE-STATUS/behavior"],
    "integration": true,
    "variants": {"KNOWLEDGE-STATUS/behavior": ["KNOWLEDGE-STATUS/migration", "KNOWLEDGE-STATUS/registered-check", "KNOWLEDGE-STATUS/checker-posteffect-expiry", "KNOWLEDGE-STATUS/typed-deferred-admission", "KNOWLEDGE-STATUS/persisted-initial-states", "KNOWLEDGE-STATUS/repeated-discussion-pending", "KNOWLEDGE-STATUS/check-binding-negative", "KNOWLEDGE-STATUS/sequential-status-history", "KNOWLEDGE-STATUS/expired-deleted-and-validity", "KNOWLEDGE-STATUS/transition-boundaries", "KNOWLEDGE-STATUS/database-integrity-and-roles", "KNOWLEDGE-STATUS/content-is-data", "KNOWLEDGE-STATUS/current-source-revocation"]}
  },
  "knowledge-correction": {
  "positives": [
    "save",
    "read",
    "write",
    "deny",
    "conflict",
    "owner"
  ],
  "file": "components/knowledge-correction.component.test.js",
  "cases": [
    "KNOWLEDGE-CORRECTION/behavior"
  ],
  "integration": true,
  "variants": {
    "KNOWLEDGE-CORRECTION/behavior": [
      "KNOWLEDGE-CORRECTION/migration",
      "KNOWLEDGE-CORRECTION/legacy-v14-correction",
      "KNOWLEDGE-CORRECTION/atomic-lineage-history",
      "KNOWLEDGE-CORRECTION/target-and-terminal-negative",
      "KNOWLEDGE-CORRECTION/deferred-lineage-rollback",
      "KNOWLEDGE-CORRECTION/two-writers-and-recreated-loser",
      "KNOWLEDGE-CORRECTION/concurrent-original-dedup",
      "KNOWLEDGE-CORRECTION/concurrent-correction-original",
      "KNOWLEDGE-CORRECTION/independent-concurrent-claims",
      "KNOWLEDGE-CORRECTION/scoped-buckets-and-contradictions",
      "KNOWLEDGE-CORRECTION/database-integrity-and-roles",
      "KNOWLEDGE-CORRECTION/content-is-data-and-revocation"
    ]
  }
},
  "command-recovery": {
    "positives": ["save", "read", "write", "deny", "conflict", "owner"],
    "file": "components/command-recovery.component.test.js",
    "cases": ["COMMAND-RECOVERY/behavior"],
    "integration": true,
    "variants": {"COMMAND-RECOVERY/behavior": ["COMMAND-RECOVERY/http-original-recreated", "COMMAND-RECOVERY/http-pending-review", "COMMAND-RECOVERY/http-closed-auth-boundaries", "COMMAND-RECOVERY/changed-binding-and-namespaces", "COMMAND-RECOVERY/actual-lost-commit-and-rollback", "COMMAND-RECOVERY/serialized-commit-rollback", "COMMAND-RECOVERY/lock-timeout-stays-unknown", "COMMAND-RECOVERY/original-lock-excludes-digest", "COMMAND-RECOVERY/same-key-concurrent-http", "COMMAND-RECOVERY/spoofed-unknown-is-denial", "COMMAND-RECOVERY/expired-original-receipt", "COMMAND-RECOVERY/read-committed-required", "COMMAND-RECOVERY/expiry-after-original-wait", "COMMAND-RECOVERY/current-source-and-native", "COMMAND-RECOVERY/authority-after-wait"]}
  },
  "knowledge": {
    "positives": ["save", "read"],
    "file": "components/knowledge.component.test.js",
    "cases": [
      "KNOWLEDGE/behavior"
    ],
    "integration": true,
    "variants": {}
  },
  "commands": {
    "positives": ["owner"],
    "file": "components/commands.component.test.js",
    "cases": [
      "COMMANDS/behavior"
    ],
    "integration": true,
    "variants": {}
  },
  "volume": {
    "positives": ["write", "read", "conflict"],
    "file": "components/volume.component.test.js",
    "cases": [
      "VOLUME/behavior"
    ],
    "integration": true,
    "variants": {"VOLUME/behavior": [
      "ARTIFACT-PUBLICATION/behavior / durable immutable bytes and orphan custody",
      "VOLUME-DRAFTS/behavior / encrypted live drafts and exact confirmed checkpoints",
      "VOLUME-PROMOTION/behavior / exact validated CAS and installed writer fences"
    ]}
  },
  "recall-broker": {
    "positives": ["read", "deny", "owner"],
    "file": "components/recall-broker.component.test.js",
    "cases": ["RECALL-BROKER/behavior"],
    "integration": true,
    "variants": {"RECALL-BROKER/behavior": ["RECALL-BROKER/build-migration", "RECALL-BROKER/registration-preservation", "RECALL-BROKER/legacy-validity-metadata-unavailable", "RECALL-BROKER/tombstoned-conflict-survivor", "RECALL-BROKER/empty-outcome-final-authority", "RECALL-BROKER/source-expiry-during-index-wait", "RECALL-BROKER/persisted-random-recreated-correction", "RECALL-BROKER/status-validity-conflict-before-decrypt", "RECALL-BROKER/independent-eight-controls-and-attachment-grants", "RECALL-BROKER/index-tail-overlay-and-canonical-scan", "RECALL-BROKER/authority-outage-and-stale-populated-cache", "RECALL-BROKER/source-revocation-and-remaining-audience", "RECALL-BROKER/scope-keyed-subject-and-session-binding", "RECALL-BROKER/real-lock-wait-and-immutable-queued-request", "RECALL-BROKER/full-audience-denied-before-decrypt", "QUERY-CONTROLS/no-default", "QUERY-CONTROLS/independent-000", "QUERY-CONTROLS/independent-001", "QUERY-CONTROLS/independent-010", "QUERY-CONTROLS/independent-011", "QUERY-CONTROLS/independent-100", "QUERY-CONTROLS/independent-101", "QUERY-CONTROLS/independent-110", "QUERY-CONTROLS/independent-111", "QUERY-CONTROLS/original-key-and-CAS", "QUERY-CONTROLS/boundary-and-foreign-binding", "QUERY-CONTROLS/concurrent-original-and-stale-contender", "QUERY-CONTROLS/direct-write-and-immutable-denial"]}
  },
  "ask-disclosure": {
    "positives": ["ask", "read", "write", "deny", "owner"],
    "file": "components/ask-disclosure.component.test.js",
    "cases": ["ASK-DISCLOSURE/behavior"],
    "integration": true,
    "variants": {"ASK-DISCLOSURE/behavior": ["ASK-DISCLOSURE/build-migration", "ASK-DISCLOSURE/short-question-native-input-limit-and-receipt-read", "ASK-DISCLOSURE/empty-current-gap-and-authenticated-receipt-integrity", "ASK-DISCLOSURE/registration-preservation", "ASK-DISCLOSURE/versioned-encrypted-manifest-current-heads", "ASK-DISCLOSURE/receipt-recreate-cache-no-charge", "ASK-DISCLOSURE/paused-allowed-useful-answer", "ASK-DISCLOSURE/paused-source-revoke-prevents-answer-and-manifest", "ASK-DISCLOSURE/disclosure-first-then-revoke-prevents-replay", "ASK-DISCLOSURE/full-audience-revision-change-before-answer-open", "ASK-DISCLOSURE/fresh-source-audience-after-membership-change", "ASK-DISCLOSURE/receipt-knowledge-correction-refuses-before-open", "ASK-DISCLOSURE/receipt-tombstone-refuses-before-open", "ASK-DISCLOSURE/receipt-key-generation-and-authority-outage-refuse", "ASK-DISCLOSURE/receipt-controls-change-refuses-before-open", "ASK-DISCLOSURE/receipt-retention-expiry-refuses-before-open", "ASK-DISCLOSURE/receipt-native-Stop-refuses-before-open", "ASK-DISCLOSURE/receipt-cross-scope-and-closed-boundary", "ASK-DISCLOSURE/missing-evidence-actionable-outcome", "ASK-DISCLOSURE/live-unsupported-actionable-outcome", "ASK-DISCLOSURE/current-authority-actionable-outcome", "ASK-DISCLOSURE/bounded-sorted-barrier-and-dependency-order", "ASK-DISCLOSURE/actual-forbidden-ports-zero"]}
  },
  "native-ask": {
    "positives": ["ask", "read", "write", "deny", "owner"],
    "file": "components/native-ask.component.test.js",
    "cases": ["NATIVE-ASK/behavior"],
    "integration": true,
    "variants": {"NATIVE-ASK/behavior": ["NATIVE-ASK/build-migration", "NATIVE-ASK/registration-preservation", "NATIVE-ASK/random-save-recreate-http-A", "NATIVE-ASK/correct-recreate-http-B", "NATIVE-ASK/installed-service-settlement-no-computer", "NATIVE-ASK/encrypted-query-answer-and-opaque-native-refs", "NATIVE-ASK/installed-rls-and-immutable-history", "NATIVE-ASK/authentication-and-closed-http-boundary", "NATIVE-ASK/budget-refusal-before-content", "NATIVE-ASK/Stop-refusal-before-content", "NATIVE-ASK/replacement-origin-refusal-before-content", "NATIVE-ASK/F03-initialized-worker-positive-then-replaced-refusal", "NATIVE-ASK/unknown-continuation-refusal-before-content", "NATIVE-ASK/persisted-pending-model-and-effect-refuse-before-content", "NATIVE-ASK/stale-revision-and-expired-command-before-content", "NATIVE-ASK/real-allowance-wait-expiry-before-content", "NATIVE-ASK/queued-Ask-observes-actual-Stop-before-content", "NATIVE-ASK/concurrent-exact-key-single-effect-and-conflict", "NATIVE-ASK/tombstone-prevents-old-answer-replay", "NATIVE-ASK/retention-expiry-yields-gap-before-decrypt", "NATIVE-ASK/source-expiry-after-seal-rolls-back-settlement", "NATIVE-ASK/reachable-forbidden-ports-zero-actual-calls"]}
  },
  "ask": {
    "positives": ["ask", "deny"],
    "file": "components/ask.component.test.js",
    "cases": [
      "ASK/behavior"
    ],
    "integration": true,
    "variants": {}
  },
  "admission": {
    "positives": ["owner", "deny"],
    "file": "components/admission.component.test.js",
    "cases": [
      "ADMISSION/behavior"
    ],
    "integration": true,
    "variants": {}
  },
  "retention-forget": {
    "positives": [
      "forget",
      "read",
      "deny"
    ],
    "file": "components/retention-forget.component.test.js",
    "cases": [
      "RETENTION-FORGET/behavior"
    ],
    "integration": true,
    "variants": {
      "RETENTION-FORGET/behavior": [
        "RETENTION-FORGET/migration-up-rollback-idempotent",
        "RETENTION-FORGET/registration-preservation",
        "RETENTION-FORGET/closed-schema-and-every-class-window",
        "RETENTION-FORGET/permitted-forget-truthful-pending-impact",
        "RETENTION-FORGET/recreated-ledger-repeat-and-binding-conflict",
        "RETENTION-FORGET/restriction-history-no-plaintext",
        "RETENTION-FORGET/roles-RLS-immutability-and-exact-FKs",
        "RETENTION-FORGET/partial-event-publication-rollback",
        "RETENTION-FORGET/committed-ack-interruption-original-recovery",
        "RETENTION-FORGET/missing-event-refuses-original-recovery",
        "RETENTION-FORGET/real-wire-commit-and-rollback-recreation",
        "RETENTION-FORGET/concurrent-identical-original-one-effect",
        "RETENTION-FORGET/competing-key-observed-lock-one-tombstone",
        "RETENTION-FORGET/command-expiry-after-observed-barrier",
        "RETENTION-FORGET/unexpired-and-stale-expiry-no-effect",
        "RETENTION-FORGET/delayed-sweep-real-knowledge-expiry-before-decrypt",
        "RETENTION-FORGET/delayed-sweep-real-source-expiry-before-decrypt",
        "RETENTION-FORGET/expiry-publication-deadline-rollback",
        "RETENTION-FORGET/every-class-control-sweep-and-recreate",
        "RETENTION-FORGET/source-revoked-while-invalidation-pending",
        "RETENTION-FORGET/member-removed-and-remaining-member-survivor",
        "RETENTION-FORGET/separate-forget-grant-and-maintenance-expiry",
        "RETENTION-FORGET/absent-independent-authority-blocks-serving",
        "RETENTION-FORGET/canonical-counts-and-no-computer-assignment"
      ]
    }
  },
  "dependency-graph": {
      "positives": [
          "read",
          "propagate",
          "deny"
      ],
      "file": "components/dependency-graph.component.test.js",
      "cases": [
          "DEPENDENCY-GRAPH/behavior"
      ],
      "integration": true,
      "variants": {
          "DEPENDENCY-GRAPH/behavior": [
              "DEPENDENCY-GRAPH/migration-up-rollback-idempotent",
              "DEPENDENCY-GRAPH/registration-preservation",
              "DEPENDENCY-GRAPH/canonical-source-knowledge-exact-edges",
              "DEPENDENCY-GRAPH/closed-scope-refs-and-material-command",
              "DEPENDENCY-GRAPH/nested-encrypted-read-and-recreated-service",
              "DEPENDENCY-GRAPH/diamond-shared-ancestor-allowed",
              "DEPENDENCY-GRAPH/source-dependent-real-artifact-and-draft",
              "DEPENDENCY-GRAPH/real-native-Ask-receipt-index-cache-edges",
              "DEPENDENCY-GRAPH/RLS-roles-exact-FKs-and-immutable-controls",
              "DEPENDENCY-GRAPH/missing-ancestor-fails-before-decrypt",
              "DEPENDENCY-GRAPH/missing-edge-inventory-fails-before-decrypt",
              "DEPENDENCY-GRAPH/cycle-fails-before-decrypt",
              "DEPENDENCY-GRAPH/witness-cipher-and-key-generation-fail-closed",
              "DEPENDENCY-GRAPH/absent-independent-authority-fails-closed",
              "DEPENDENCY-GRAPH/query-plan-uses-scoped-edge-index",
              "DEPENDENCY-GRAPH/source-revoke-exact-durable-descendant-jobs",
              "DEPENDENCY-GRAPH/independent-branch-survives-restriction",
              "DEPENDENCY-GRAPH/late-derived-publication-refused-no-resurrection",
              "DEPENDENCY-GRAPH/correction-current-head-overlay-and-exact-jobs",
              "DEPENDENCY-GRAPH/knowledge-forget-selective-descendants",
              "DEPENDENCY-GRAPH/partial-job-insert-rolls-back-restriction",
              "DEPENDENCY-GRAPH/lost-ACK-recreated-exact-jobs",
              "DEPENDENCY-GRAPH/concurrent-original-one-exact-job-set",
              "DEPENDENCY-GRAPH/disclosure-first-observed-revoke-wait",
              "DEPENDENCY-GRAPH/restriction-first-observed-reader-wait",
              "DEPENDENCY-GRAPH/missing-job-refuses-truthful-impact",
              "DEPENDENCY-GRAPH/deferred-missing-payload-rolls-back-publication",
              "DEPENDENCY-GRAPH/deferred-missing-job-rolls-back-restriction",
              "DEPENDENCY-GRAPH/delayed-expiry-blocks-derived-before-open-and-queues-exactly",
              "DEPENDENCY-GRAPH/depth16-positive-depth17-refused",
              "DEPENDENCY-GRAPH/nodes512-positive-nodes513-refused",
              "DEPENDENCY-GRAPH/all-current-audience-before-derived-decrypt",
              "DEPENDENCY-GRAPH/pending-jobs-no-worker-charge-or-computer"
          ]
      }
  },
  "maintenance-admission": {
      "positives": [
          "save",
          "read",
          "write",
          "deny",
          "owner"
      ],
      "file": "components/maintenance-admission.component.test.js",
      "cases": [
          "MAINTENANCE-ADMISSION/behavior"
      ],
      "integration": true,
      "variants": {
          "MAINTENANCE-ADMISSION/behavior": [
              "MAINTENANCE-ADMISSION/migration-up-rollback-idempotent",
              "MAINTENANCE-ADMISSION/registration-preservation",
              "MAINTENANCE-ADMISSION/closed-command-installed-plan-policy",
              "MAINTENANCE-ADMISSION/summary-index-cache-nested-encrypted-recreated",
              "MAINTENANCE-ADMISSION/direct-source-and-deterministic-unicode-bounds",
              "MAINTENANCE-ADMISSION/exact-receipt-origin-allowance-no-double-charge",
              "MAINTENANCE-ADMISSION/budget-refused-before-open-no-result",
              "MAINTENANCE-ADMISSION/profile-region-source-policy-refused-before-open",
              "MAINTENANCE-ADMISSION/native-Stop-and-answer-origin-refused-before-open",
              "MAINTENANCE-ADMISSION/receipt-owner-origin-generation-purpose-refused",
              "MAINTENANCE-ADMISSION/current-head-and-source-revoke-before-open",
              "MAINTENANCE-ADMISSION/missing-authority-and-stale-cache-refuse-before-open",
              "MAINTENANCE-ADMISSION/cleanup-only-grant-cannot-read-sensitive-content",
              "MAINTENANCE-ADMISSION/full-current-audience-refused-before-open",
              "MAINTENANCE-ADMISSION/policy-changes-after-decrypt-roll-back-charge",
              "MAINTENANCE-ADMISSION/policy-changes-after-publication-roll-back-all",
              "MAINTENANCE-ADMISSION/real-allowance-wait-expiry-before-open",
              "MAINTENANCE-ADMISSION/concurrent-original-one-charge-one-projection",
              "MAINTENANCE-ADMISSION/reused-receipt-cannot-fund-new-build",
              "MAINTENANCE-ADMISSION/missing-final-receipt-deferred-rollback",
              "MAINTENANCE-ADMISSION/partial-result-error-rollback-and-recreated-original",
              "MAINTENANCE-ADMISSION/actual-lost-COMMIT-and-rollback-original-recovery",
              "MAINTENANCE-ADMISSION/roles-RLS-immutability-and-exact-receipt-FKs",
              "MAINTENANCE-ADMISSION/source-expiry-before-open-and-after-seal",
              "MAINTENANCE-ADMISSION/destination-CAS-stale-and-competing-writers-before-open",
              "MAINTENANCE-ADMISSION/policy-changed-during-meter-admission-before-open",
              "MAINTENANCE-ADMISSION/queued-build-observes-real-source-revoke-before-open",
              "MAINTENANCE-ADMISSION/no-supplier-new-budget-computer-or-duplicate-effects"
          ]
      }
  },
  "propagation-retry": {
  "positives": [
    "propagate",
    "forget",
    "deny",
    "owner"
  ],
  "file": "components/propagation-retry.component.test.js",
  "cases": [
    "PROPAGATION-RETRY/behavior"
  ],
  "integration": true,
  "variants": {
    "PROPAGATION-RETRY/behavior": [
      "PROPAGATION-RETRY/migration-up-pending-rollback-idempotent",
      "PROPAGATION-RETRY/registration-preservation-and-closed-CLI",
      "PROPAGATION-RETRY/closed-input-and-owner-bounds",
      "PROPAGATION-RETRY/bounded-one-descendant-truthful-partial",
      "PROPAGATION-RETRY/fail-after-real-committed-descendant-recreate-converge-once",
      "PROPAGATION-RETRY/active-lease-expiry-reclaim-and-stale-token-fenced",
      "PROPAGATION-RETRY/concurrent-claim-and-exact-duplicate-one-result",
      "PROPAGATION-RETRY/wrong-worker-session-job-and-foreign-scope-refused",
      "PROPAGATION-RETRY/failure-after-claim-rolls-back-lease",
      "PROPAGATION-RETRY/failure-after-real-mutation-rolls-back-progress",
      "PROPAGATION-RETRY/lease-expiry-after-mutation-rolls-back",
      "PROPAGATION-RETRY/command-expiry-after-mutation-rolls-back",
      "PROPAGATION-RETRY/overlapping-original-events-converge-one-invalidation",
      "PROPAGATION-RETRY/delete-obsolete-descendant-cannot-resurrect",
      "PROPAGATION-RETRY/expiry-obsolete-descendant-cannot-resurrect",
      "PROPAGATION-RETRY/correction-new-canonical-head-survives-old-job",
      "PROPAGATION-RETRY/expiry-original-root-propagates-without-rebuild",
      "PROPAGATION-RETRY/unaffected-branch-remains-useful",
      "PROPAGATION-RETRY/native-Stop-and-authority-outage-refuse",
      "PROPAGATION-RETRY/observed-job-lock-wait-expires-lease",
      "PROPAGATION-RETRY/current-membership-and-audience-revocation-before-process",
      "PROPAGATION-RETRY/bounded-claim-query-index-plan",
      "PROPAGATION-RETRY/observed-restriction-first-refuses-queued-publication",
      "PROPAGATION-RETRY/observed-publication-first-enrolls-then-invalidates",
      "PROPAGATION-RETRY/actual-lost-COMMIT-and-rollback-recreated-exact-progress",
      "PROPAGATION-RETRY/roles-RLS-immutability-and-exact-FKs",
      "PROPAGATION-RETRY/unfinished-invalidation-deferred-COMMIT-refused",
      "PROPAGATION-RETRY/no-rebuild-head-write-budget-computer-or-duplicate"
    ]
  }
},
  "lifecycle": {
    "positives": ["forget", "propagate"],
    "file": "components/lifecycle.component.test.js",
    "cases": [
      "LIFECYCLE/behavior"
    ],
    "integration": true,
    "variants": {}
  },
  "maintenance": {
    "positives": ["propagate", "owner", "deny"],
    "file": "components/maintenance.component.test.js",
    "cases": [
      "MAINTENANCE/behavior"
    ],
    "integration": true,
    "variants": {}
  },
  "backup-capture": {
  "positives": [
    "backup",
    "read",
    "deny",
    "owner"
  ],
  "file": "components/backup-capture.component.test.js",
  "cases": [
    "BACKUP-CAPTURE/behavior"
  ],
  "integration": true,
  "variants": {
    "BACKUP-CAPTURE/behavior": [
      "BACKUP-CAPTURE/registration-preservation-closed-CLI",
      "BACKUP-CAPTURE/closed-command-no-archive-authority",
      "BACKUP-CAPTURE/source-knowledge-exact-envelopes-original-binding",
      "BACKUP-CAPTURE/archive-excludes-plaintext-keys-control-and-SQL",
      "BACKUP-CAPTURE/original-key-single-directory-no-overwrite",
      "BACKUP-CAPTURE/checkpoint-C1-excludes-later-live-C2-unsaved-work",
      "BACKUP-CAPTURE/canonical-artifact-original-binary-and-encrypted-manifest",
      "BACKUP-CAPTURE/missing-later-volume-index-cannot-become-canonical-artifact",
      "BACKUP-CAPTURE/physical-separate-owned-root-refused",
      "BACKUP-CAPTURE/backup-only-read-only-and-cleanup-only-grants-refused",
      "BACKUP-CAPTURE/missing-original-key-refused-before-write",
      "BACKUP-CAPTURE/foreign-scope-and-native-session-refused",
      "BACKUP-CAPTURE/observed-capture-first-writer-gets-later-revision",
      "BACKUP-CAPTURE/observed-writer-first-authority-gap-current-key-new-revision",
      "BACKUP-CAPTURE/current-source-revocation-excludes-ancestry",
      "BACKUP-CAPTURE/confirmed-object-tamper-refused-no-archive",
      "BACKUP-CAPTURE/object-symlink-refused-sentinel-preserved",
      "BACKUP-CAPTURE/missing-independent-authority-refused",
      "BACKUP-CAPTURE/derived-summary-index-cache-original-ancestry-envelopes",
      "BACKUP-CAPTURE/retained-native-Ask-original-encrypted-answer-and-manifest",
      "BACKUP-CAPTURE/missing-confirmed-file-refused-no-partial-inventory",
      "BACKUP-CAPTURE/expired-command-before-open-and-after-real-barrier-wait",
      "BACKUP-CAPTURE/current-audience-revocation-refused-before-archive",
      "BACKUP-CAPTURE/native-Stop-refused-before-content",
      "BACKUP-CAPTURE/archive-is-prepared-only-no-authority-effect"
    ]
  }
},
  "backup": {
    "positives": ["backup"],
    "file": "components/backup.component.test.js",
    "cases": [
      "BACKUP/behavior"
    ],
    "integration": true,
    "variants": {
      "BACKUP/behavior": [
            "BACKUP-CAPTURE/registration-preservation-closed-CLI",
            "BACKUP-CAPTURE/closed-command-no-archive-authority",
            "BACKUP-CAPTURE/source-knowledge-exact-envelopes-original-binding",
            "BACKUP-CAPTURE/archive-excludes-plaintext-keys-control-and-SQL",
            "BACKUP-CAPTURE/original-key-single-directory-no-overwrite",
            "BACKUP-CAPTURE/checkpoint-C1-excludes-later-live-C2-unsaved-work",
            "BACKUP-CAPTURE/canonical-artifact-original-binary-and-encrypted-manifest",
            "BACKUP-CAPTURE/missing-later-volume-index-cannot-become-canonical-artifact",
            "BACKUP-CAPTURE/physical-separate-owned-root-refused",
            "BACKUP-CAPTURE/backup-only-read-only-and-cleanup-only-grants-refused",
            "BACKUP-CAPTURE/missing-original-key-refused-before-write",
            "BACKUP-CAPTURE/foreign-scope-and-native-session-refused",
            "BACKUP-CAPTURE/observed-capture-first-writer-gets-later-revision",
            "BACKUP-CAPTURE/observed-writer-first-authority-gap-current-key-new-revision",
            "BACKUP-CAPTURE/current-source-revocation-excludes-ancestry",
            "BACKUP-CAPTURE/confirmed-object-tamper-refused-no-archive",
            "BACKUP-CAPTURE/object-symlink-refused-sentinel-preserved",
            "BACKUP-CAPTURE/missing-independent-authority-refused",
            "BACKUP-CAPTURE/derived-summary-index-cache-original-ancestry-envelopes",
            "BACKUP-CAPTURE/retained-native-Ask-original-encrypted-answer-and-manifest",
            "BACKUP-CAPTURE/missing-confirmed-file-refused-no-partial-inventory",
            "BACKUP-CAPTURE/expired-command-before-open-and-after-real-barrier-wait",
            "BACKUP-CAPTURE/current-audience-revocation-refused-before-archive",
            "BACKUP-CAPTURE/native-Stop-refused-before-content",
            "BACKUP-CAPTURE/archive-is-prepared-only-no-authority-effect",
            "BACKUP/migration-rollback-repeat-owner-preservation",
            "BACKUP/closed-command-and-original-only",
            "BACKUP/prepared-archive-is-unavailable-to-restoration",
            "BACKUP/capture-interruption-archive-fsynced",
            "BACKUP/confirmation-interruption-archive-fsynced",
            "BACKUP/capture-interruption-directory-fsynced",
            "BACKUP/confirmation-interruption-directory-fsynced",
            "BACKUP/process-kill-capture-archive-fsynced",
            "BACKUP/process-kill-capture-directory-fsynced",
            "BACKUP/process-kill-confirm-archive-fsynced",
            "BACKUP/process-kill-confirm-directory-fsynced",
            "BACKUP/fsync-before-PG-exact-confirmation-and-recreation",
            "BACKUP/changed-original-payload-never-reconfirms",
            "BACKUP/lost-owner-ACK-exact-original-no-replay",
            "BACKUP/expired-original-command-recovers-same-confirmation",
            "BACKUP/partial-PG-effect-rolls-back-original-absence",
            "BACKUP/actual-lost-COMMIT-and-rollback-ACK",
            "BACKUP/concurrent-original-lookup-observed-commit-and-rollback",
            "BACKUP/concurrent-identical-confirmation-one-exact-receipt",
            "BACKUP/archive-tamper-missing-extra-and-truncated-refused",
            "BACKUP/archive-symlink-hardlink-foreign-root-refused",
            "BACKUP/confirmed-corruption-never-becomes-restore-candidate",
            "BACKUP/current-key-audience-scope-and-native-Stop-refused",
            "BACKUP/backup-read-maintenance-grants-are-independent",
            "BACKUP/expired-command-before-open-after-fsync-and-barrier-wait",
            "BACKUP/current-epoch-change-refuses-stale-preparation",
            "BACKUP/forced-RLS-immutable-worker-IdP-and-direct-write-denied",
            "BACKUP/finite-expiry-blocks-restoration-before-and-after-open",
            "BACKUP/backup-expiry-during-PG-confirmation-rolls-back",
            "BACKUP/no-VM-no-replay-no-authority-restore-claims"
      ]
}
  },
  "restore": {
  "positives": [
    "restore",
    "read"
  ],
  "file": "components/restore.component.test.js",
  "cases": [
    "RESTORE/behavior"
  ],
  "integration": true,
  "variants": {
    "RESTORE/behavior": [
      "RESTORE-ACTIVATION/migration-rollback-preserves-v27-and-installed-owners",
      "RESTORE-ACTIVATION/registration-preservation-and-closed-CLI",
      "RESTORE-ACTIVATION/closed-command-and-unverified-scope-before-open",
      "RESTORE-ACTIVATION/actual-owned-content-loss-surviving-PG-and-held-keys",
      "RESTORE-ACTIVATION/fresh-import-from-backup-after-owned-loss",
      "RESTORE-ACTIVATION/staged-read-and-index-rehydration-no-serving",
      "RESTORE-ACTIVATION/post-backup-delete-and-correction-preserve-current-control",
      "RESTORE-ACTIVATION/missing-independent-anchor-blocks-before-stage-open",
      "RESTORE-ACTIVATION/stale-PG-authority-and-missing-head-block-generation",
      "RESTORE-ACTIVATION/foreign-and-expired-native-before-stage-open",
      "RESTORE-ACTIVATION/partial-import-never-activated",
      "RESTORE-ACTIVATION/current-grants-and-full-audience-before-stage-open",
      "RESTORE-ACTIVATION/rollback-before-activation-has-no-serving-or-control-effect",
      "RESTORE-ACTIVATION/original-key-claim-must-survive-activation",
      "RESTORE-ACTIVATION/target-key-root-and-original-command-binding-denied",
      "RESTORE-ACTIVATION/stage-replacement-at-final-barrier-rolls-back",
      "RESTORE-ACTIVATION/locked-activation-current-survivors-and-blocked-freshness",
      "RESTORE-ACTIVATION/recreated-target-exact-source-knowledge-artifact-after-loss",
      "RESTORE-ACTIVATION/current-authorized-group-member-can-read-restored-survivor",
      "RESTORE-ACTIVATION/current-audience-removal-blocks-target-open-after-activation",
      "RESTORE-ACTIVATION/wrong-and-missing-target-key-fail-closed",
      "RESTORE-ACTIVATION/restricted-and-superseded-N-never-open-or-current",
      "RESTORE-ACTIVATION/recreated-native-Ask-useful-survivor-and-no-computer",
      "RESTORE-ACTIVATION/corrected-N-plus-one-gap-does-not-answer-N",
      "RESTORE-ACTIVATION/foreign-scope-and-closed-read-boundary",
      "RESTORE-ACTIVATION/immutable-RLS-and-controller-worker-IdP-denials",
      "RESTORE-ACTIVATION/same-original-cannot-publish-second-activation",
      "RESTORE-ACTIVATION/read-target-corruption-after-activation-fails-integrity",
      "RESTORE-ACTIVATION/missing-target-has-explicit-safe-restore-error",
      "RESTORE-ACTIVATION/post-activation-delete-is-rechecked-before-target-open",
      "RESTORE-ACTIVATION/post-activation-current-policy-retention-applies-to-ancestry",
      "RESTORE-ACTIVATION/encrypted-generation-and-no-control-credential-effect-replay",
      "RESTORE-ACTIVATION/staged-missing-cannot-activate",
      "RESTORE-ACTIVATION/staged-digest-cannot-activate",
      "RESTORE-ACTIVATION/staged-symlink-cannot-activate"
    ]
  }
},
  "restore-recovery": {
  "positives": [
    "restore",
    "deny"
  ],
  "file": "components/restore-recovery.component.test.js",
  "cases": [
    "RESTORE-RECOVERY/behavior"
  ],
  "integration": true,
  "variants": {
    "RESTORE-RECOVERY/behavior": [
      "RESTORE-PROGRESS/migration-rollback-idempotence-and-owner-preservation",
      "RESTORE-PROGRESS/registration-preservation-and-closed-CLI",
      "RESTORE-PROGRESS/closed-command-and-unverified-scope-before-write",
      "RESTORE-PROGRESS/process-kill-item-fsynced-resumes-original-generation",
      "RESTORE-PROGRESS/process-kill-item-recorded-resumes-original-generation",
      "RESTORE-PROGRESS/staged-interruption-restarts-exact-original",
      "RESTORE-PROGRESS/reconcile-interruption-restarts-one-generation",
      "RESTORE-PROGRESS/changed-original-payload-and-scope-never-create-generation",
      "RESTORE-PROGRESS/observed-concurrent-original-resume-one-generation",
      "RESTORE-PROGRESS/actual-activation-COMMIT-ACK-loss-exact-lookup-and-replay",
      "RESTORE-PROGRESS/expired-original-lookup-retains-current-authorization",
      "RESTORE-PROGRESS/current-grants-deny-every-progress-operation",
      "RESTORE-PROGRESS/current-independent-authority-required-on-restart",
      "RESTORE-PROGRESS/native-Stop-fences-stale-resume-and-activation-writer",
      "RESTORE-PROGRESS/rollback-staged-disables-and-removes-only-owned-stage",
      "RESTORE-PROGRESS/rollback-ready-disables-restored-read-and-admission-no-jobs",
      "RESTORE-PROGRESS/cleanup-missing-refuses-unproven-delete",
      "RESTORE-PROGRESS/cleanup-tamper-refuses-unproven-delete",
      "RESTORE-PROGRESS/cleanup-symlink-refuses-unproven-delete",
      "RESTORE-PROGRESS/cleanup-hardlink-refuses-unproven-delete",
      "RESTORE-PROGRESS/cleanup-owner-marker-refuses-unproven-delete",
      "RESTORE-PROGRESS/rollback-preserves-current-delete-and-restriction-epoch",
      "RESTORE-PROGRESS/immutable-RLS-and-worker-IdP-cancellation-denials",
      "RESTORE-PROGRESS/encrypted-progress-and-cancellation-never-emit-keys-or-content",
      "RESTORE-PROGRESS/observed-activation-lookup-and-replay-share-original-lock"
    ]
  }
},
  "harness": {
    "positives": ["harness"],
    "file": "components/harness.component.test.js",
    "cases": [
      "HARNESS/behavior"
    ],
    "integration": true,
    "variants": {}
  },
  "security": {
    "positives": ["read", "deny"],
    "file": "components/security.component.test.js",
    "cases": [
      "SECURITY/behavior"
    ],
    "integration": true,
    "variants": {}
  },
  "restore-import": {
  "positives": [
    "restore",
    "read",
    "write",
    "deny",
    "owner"
  ],
  "file": "components/restore-import.component.test.js",
  "cases": [
    "RESTORE-IMPORT/behavior"
  ],
  "integration": true,
  "variants": {
    "RESTORE-IMPORT/behavior": [
      "RESTORE-IMPORT/registration-preservation-and-closed-CLI",
      "RESTORE-IMPORT/closed-command-and-unverified-scope-no-target",
      "RESTORE-IMPORT/source-knowledge-original-cipher-bytes-fresh-generation",
      "RESTORE-IMPORT/current-authority-original-receipts-and-source-archive-unchanged",
      "RESTORE-IMPORT/SQL-and-control-fields-never-executed",
      "RESTORE-IMPORT/schema-count-decoded-bounds-and-composite-refs",
      "RESTORE-IMPORT/confirmed-missing-source-refuses-before-target",
      "RESTORE-IMPORT/confirmed-wrong-immutable-task-refuses-before-decrypt",
      "RESTORE-IMPORT/prepared-unconfirmed-archive-cannot-import",
      "RESTORE-IMPORT/archive-symlink-hardlink-directory-traversal-sentinel",
      "RESTORE-IMPORT/unowned-target-root-marker-inode-and-key-owner-refused",
      "RESTORE-IMPORT/wrong-and-missing-original-key-before-stage",
      "RESTORE-IMPORT/inner-envelope-original-AAD-and-authentication",
      "RESTORE-IMPORT/staged-item-replaced-refuses-final-validation",
      "RESTORE-IMPORT/staged-symlink-refuses-final-validation",
      "RESTORE-IMPORT/encrypted-progress-tamper-refuses-final-validation",
      "RESTORE-IMPORT/source-archive-changed-after-staging-never-activates",
      "RESTORE-IMPORT/expired-and-foreign-native-authority-before-open",
      "RESTORE-IMPORT/current-grants-and-full-audience-before-content-open",
      "RESTORE-IMPORT/full-current-audience-refused-before-archive-open",
      "RESTORE-IMPORT/expiry-after-staged-write-leaves-blocked-progress",
      "RESTORE-IMPORT/observed-concurrent-same-target-one-blocked-generation",
      "RESTORE-IMPORT/original-key-changed-target-cannot-create-second-generation",
      "RESTORE-IMPORT/distinct-operations-independent-fresh-generations",
      "RESTORE-IMPORT/target-key-failure-leaves-only-blocked-progress",
      "RESTORE-IMPORT/plaintext-and-key-canaries-absent-from-staging",
      "RESTORE-IMPORT/binary-saved-draft-live-checkpoint-and-derived",
      "RESTORE-IMPORT/confirmed-canonical-artifact-and-native-Ask-imported-as-data",
      "RESTORE-IMPORT/same-operation-and-original-key-in-foreign-scope-independent",
      "RESTORE-IMPORT/no-serving-no-authority-or-native-execution-restore",
      "RESTORE-IMPORT/archive-missing-refused",
      "RESTORE-IMPORT/archive-truncated-refused",
      "RESTORE-IMPORT/archive-body-refused",
      "RESTORE-IMPORT/archive-tag-refused",
      "RESTORE-IMPORT/archive-digest-refused",
      "RESTORE-IMPORT/archive-extra-refused",
      "RESTORE-IMPORT/interruption-item-fsynced-recreated-encrypted-progress-blocked",
      "RESTORE-IMPORT/interruption-item-recorded-recreated-encrypted-progress-blocked"
    ]
  }
}
,
  "restore-activation": {
  "positives": [
    "save",
    "ask",
    "backup",
    "restore",
    "read",
    "write",
    "deny",
    "owner"
  ],
  "file": "components/restore-activation.component.test.js",
  "cases": [
    "RESTORE-ACTIVATION/behavior"
  ],
  "integration": true,
  "variants": {
    "RESTORE-ACTIVATION/behavior": [
      "RESTORE-ACTIVATION/migration-rollback-preserves-v27-and-installed-owners",
      "RESTORE-ACTIVATION/registration-preservation-and-closed-CLI",
      "RESTORE-ACTIVATION/closed-command-and-unverified-scope-before-open",
      "RESTORE-ACTIVATION/actual-owned-content-loss-surviving-PG-and-held-keys",
      "RESTORE-ACTIVATION/fresh-import-from-backup-after-owned-loss",
      "RESTORE-ACTIVATION/staged-read-and-index-rehydration-no-serving",
      "RESTORE-ACTIVATION/post-backup-delete-and-correction-preserve-current-control",
      "RESTORE-ACTIVATION/missing-independent-anchor-blocks-before-stage-open",
      "RESTORE-ACTIVATION/stale-PG-authority-and-missing-head-block-generation",
      "RESTORE-ACTIVATION/foreign-and-expired-native-before-stage-open",
      "RESTORE-ACTIVATION/partial-import-never-activated",
      "RESTORE-ACTIVATION/current-grants-and-full-audience-before-stage-open",
      "RESTORE-ACTIVATION/rollback-before-activation-has-no-serving-or-control-effect",
      "RESTORE-ACTIVATION/original-key-claim-must-survive-activation",
      "RESTORE-ACTIVATION/target-key-root-and-original-command-binding-denied",
      "RESTORE-ACTIVATION/stage-replacement-at-final-barrier-rolls-back",
      "RESTORE-ACTIVATION/locked-activation-current-survivors-and-blocked-freshness",
      "RESTORE-ACTIVATION/recreated-target-exact-source-knowledge-artifact-after-loss",
      "RESTORE-ACTIVATION/current-authorized-group-member-can-read-restored-survivor",
      "RESTORE-ACTIVATION/current-audience-removal-blocks-target-open-after-activation",
      "RESTORE-ACTIVATION/wrong-and-missing-target-key-fail-closed",
      "RESTORE-ACTIVATION/restricted-and-superseded-N-never-open-or-current",
      "RESTORE-ACTIVATION/recreated-native-Ask-useful-survivor-and-no-computer",
      "RESTORE-ACTIVATION/corrected-N-plus-one-gap-does-not-answer-N",
      "RESTORE-ACTIVATION/foreign-scope-and-closed-read-boundary",
      "RESTORE-ACTIVATION/immutable-RLS-and-controller-worker-IdP-denials",
      "RESTORE-ACTIVATION/same-original-cannot-publish-second-activation",
      "RESTORE-ACTIVATION/read-target-corruption-after-activation-fails-integrity",
      "RESTORE-ACTIVATION/missing-target-has-explicit-safe-restore-error",
      "RESTORE-ACTIVATION/post-activation-delete-is-rechecked-before-target-open",
      "RESTORE-ACTIVATION/post-activation-current-policy-retention-applies-to-ancestry",
      "RESTORE-ACTIVATION/encrypted-generation-and-no-control-credential-effect-replay",
      "RESTORE-ACTIVATION/staged-missing-cannot-activate",
      "RESTORE-ACTIVATION/staged-digest-cannot-activate",
      "RESTORE-ACTIVATION/staged-symlink-cannot-activate"
    ]
  }
}
,
  "restore-progress": {
  "positives": [
    "save",
    "backup",
    "restore",
    "read",
    "write",
    "deny",
    "owner"
  ],
  "file": "components/restore-progress.component.test.js",
  "cases": [
    "RESTORE-PROGRESS/behavior"
  ],
  "integration": true,
  "variants": {
    "RESTORE-PROGRESS/behavior": [
      "RESTORE-PROGRESS/migration-rollback-idempotence-and-owner-preservation",
      "RESTORE-PROGRESS/registration-preservation-and-closed-CLI",
      "RESTORE-PROGRESS/closed-command-and-unverified-scope-before-write",
      "RESTORE-PROGRESS/process-kill-item-fsynced-resumes-original-generation",
      "RESTORE-PROGRESS/process-kill-item-recorded-resumes-original-generation",
      "RESTORE-PROGRESS/staged-interruption-restarts-exact-original",
      "RESTORE-PROGRESS/reconcile-interruption-restarts-one-generation",
      "RESTORE-PROGRESS/changed-original-payload-and-scope-never-create-generation",
      "RESTORE-PROGRESS/observed-concurrent-original-resume-one-generation",
      "RESTORE-PROGRESS/actual-activation-COMMIT-ACK-loss-exact-lookup-and-replay",
      "RESTORE-PROGRESS/expired-original-lookup-retains-current-authorization",
      "RESTORE-PROGRESS/current-grants-deny-every-progress-operation",
      "RESTORE-PROGRESS/current-independent-authority-required-on-restart",
      "RESTORE-PROGRESS/native-Stop-fences-stale-resume-and-activation-writer",
      "RESTORE-PROGRESS/rollback-staged-disables-and-removes-only-owned-stage",
      "RESTORE-PROGRESS/rollback-ready-disables-restored-read-and-admission-no-jobs",
      "RESTORE-PROGRESS/cleanup-missing-refuses-unproven-delete",
      "RESTORE-PROGRESS/cleanup-tamper-refuses-unproven-delete",
      "RESTORE-PROGRESS/cleanup-symlink-refuses-unproven-delete",
      "RESTORE-PROGRESS/cleanup-hardlink-refuses-unproven-delete",
      "RESTORE-PROGRESS/cleanup-owner-marker-refuses-unproven-delete",
      "RESTORE-PROGRESS/rollback-preserves-current-delete-and-restriction-epoch",
      "RESTORE-PROGRESS/immutable-RLS-and-worker-IdP-cancellation-denials",
      "RESTORE-PROGRESS/encrypted-progress-and-cancellation-never-emit-keys-or-content",
      "RESTORE-PROGRESS/observed-activation-lookup-and-replay-share-original-lock"
    ]
  }
}
,
  "harness-build": {
  "positives": null,
  "file": "components/harness-build.component.test.js",
  "cases": [
    "HARNESS-BUILD/behavior"
  ],
  "integration": false,
  "variants": {
    "HARNESS-BUILD/behavior": [
      "HARNESS-BUILD/registration-preservation",
      "HARNESS-BUILD/fresh-build",
      "HARNESS-BUILD/compiler-failure",
      "HARNESS-BUILD/deleted-source",
      "HARNESS-BUILD/stale-output",
      "HARNESS-BUILD/owner-emission",
      "HARNESS-BUILD/dependency-pins",
      "HARNESS-BUILD/removed-suite",
      "HARNESS-BUILD/removed-case",
      "HARNESS-BUILD/empty-suite",
      "HARNESS-BUILD/failure",
      "HARNESS-BUILD/cancellation",
      "HARNESS-BUILD/skip",
      "HARNESS-BUILD/todo",
      "HARNESS-BUILD/forged-label",
      "HARNESS-BUILD/forged-totals",
      "HARNESS-BUILD/missing-variant",
      "HARNESS-BUILD/unknown-argument"
    ]
  }
}
,
  "harness-cleanup": {
  "positives": null,
  "file": "components/harness-cleanup.component.test.js",
  "cases": [
    "HARNESS-CLEANUP/behavior"
  ],
  "integration": false,
  "variants": {
    "HARNESS-CLEANUP/behavior": [
      "HARNESS-CLEANUP/registration-preservation",
      "HARNESS-CLEANUP/real-census",
      "HARNESS-CLEANUP/loopback",
      "HARNESS-CLEANUP/owned-child",
      "HARNESS-CLEANUP/cached-pg",
      "HARNESS-CLEANUP/census-denied",
      "HARNESS-CLEANUP/loopback-denied",
      "HARNESS-CLEANUP/pg-unavailable",
      "HARNESS-CLEANUP/child-cleanup-failed",
      "HARNESS-CLEANUP/root-cleanup-failed",
      "HARNESS-CLEANUP/container-cleanup-failed",
      "HARNESS-CLEANUP/symlink-cache",
      "HARNESS-CLEANUP/instance-substitution",
      "HARNESS-CLEANUP/guards-on-failure",
      "HARNESS-CLEANUP/exact-executed-identities",
      "HARNESS-CLEANUP/missing-positive",
      "HARNESS-CLEANUP/unauthorized-disclosure",
      "HARNESS-CLEANUP/unauthorized-mutation",
      "HARNESS-CLEANUP/silent-lost-update",
      "HARNESS-CLEANUP/duplicate-canonical-effect",
      "HARNESS-CLEANUP/restricted-resurrection",
      "HARNESS-CLEANUP/ask-computer-start",
      "HARNESS-CLEANUP/missing-fixture-never-skipped"
    ]
  }
}
,
"verify-authority": {
  "positives": [
    "read",
    "deny"
  ],
  "file": "components/verify-authority.component.test.js",
  "cases": [
    "A01",
    "A02",
    "A03",
    "A04",
    "A05",
    "A06"
  ],
  "integration": true,
  "variants": {
    "A01": [
      "A01/same-scope",
      "A01/shared-source",
      "A01/cross-tenant-denied",
      "A01/share-forward-first",
      "A01/share-reverse-first"
    ],
    "A02": [
      "A02/private-group-denied",
      "A02/full-audience",
      "A02/guest-denied",
      "A02/permitted-group"
    ],
    "A03": [
      "A03/forgery",
      "A03/source-payer-revoked",
      "A03/destination-payer-revoked",
      "A03/membership-revoked",
      "A03/space-revoked",
      "A03/session-expiry-after-lock",
      "A03/token-expiry-after-effects",
      "A03/share-forward-first",
      "A03/share-reverse-first"
    ],
    "A04": [
      "A04/role-ownership",
      "A04/forced-rls",
      "A04/direct-worker-denied",
      "A04/direct-idp-denied",
      "A04/public-denied",
      "A04/cross-scope-denied"
    ],
    "A05": [
      "A05/authority-offline",
      "A05/cache-offline",
      "A05/save-offline",
      "A05/derived-offline",
      "A05/restore-offline",
      "A05/authority-recovered"
    ],
    "A06": [
      "A06/reader-denied",
      "A06/contributor-denied",
      "A06/operator-allowed",
      "A06/grant-revoked-after-wait",
      "A06/policy-extension-denied"
    ]
  }
}

,
"verify-atomic": {
  "positives": [
    "save",
    "deny"
  ],
  "file": "components/verify-atomic.component.test.js",
  "cases": [
    "K03",
    "K06",
    "K07"
  ],
  "integration": true,
  "variants": {
    "K03": [
      "K03/kill-revision",
      "K03/kill-head",
      "K03/kill-receipt",
      "K03/kill-event",
      "K03/kill-outbox",
      "K03/committed-recreated",
      "K03/response-after-commit"
    ],
    "K06": [
      "K06/same-key-identical-concurrent",
      "K06/same-key-changed-concurrent",
      "K06/recreated-retry",
      "K06/exact-effect-counts"
    ],
    "K07": [
      "K07/observed-commit-wait",
      "K07/observed-rollback-wait",
      "K07/observed-timeout",
      "K07/lost-commit-ack",
      "K07/serialized-absence-no-replay"
    ]
  }
}

,
"verify-knowledge": {
  "positives": [
    "save",
    "deny",
    "conflict",
    "owner"
  ],
  "file": "components/verify-knowledge.component.test.js",
  "cases": [
    "K01",
    "K02",
    "K08",
    "K09"
  ],
  "integration": true,
  "variants": {
    "K01": [
      "K01/assertion",
      "K01/registered-check",
      "K01/correction",
      "K01/unrelated-survives",
      "K01/recreated-history"
    ],
    "K02": [
      "K02/discussion",
      "K02/proposal",
      "K02/proposal-repeated",
      "K02/disputed",
      "K02/forged-check",
      "K02/secret",
      "K02/indefinite-retention",
      "K02/explicit-save"
    ],
    "K08": [
      "K08/writer-a-wins",
      "K08/writer-b-wins",
      "K08/recreated-loser",
      "K08/independent-facts-both-succeed"
    ],
    "K09": [
      "K09/no-control-promotion",
      "K09/no-method-release",
      "K09/no-check-authority",
      "K09/archive-no-authority"
    ]
  }
}

,
"verify-artifact": {
  "positives": [
    "write",
    "read",
    "deny"
  ],
  "file": "components/verify-artifact.component.test.js",
  "cases": [
    "K04",
    "K05"
  ],
  "integration": true,
  "variants": {
    "K04": [
      "K04/kill-staged",
      "K04/kill-file-fsynced",
      "K04/kill-renamed",
      "K04/kill-directory-fsynced",
      "K04/kill-manifest-confirmed",
      "K04/kill-before-publication",
      "K04/kill-after-publication",
      "K04/corrupt-published"
    ],
    "K05": [
      "K05/active-lease",
      "K05/published-reachable",
      "K05/unknown-protected",
      "K05/expired-orphan",
      "K05/gc-stage-first",
      "K05/gc-publish-first",
      "K05/kill-gc",
      "K05/unowned-sentinel"
    ]
  }
}

,
"verify-volume": {
  "positives": [
    "write",
    "read",
    "conflict"
  ],
  "file": "components/verify-volume.component.test.js",
  "cases": [
    "V01",
    "V02",
    "V03",
    "V04",
    "V05"
  ],
  "integration": true,
  "variants": {
    "V01": [
      "V01/live-written",
      "V01/draft-saved",
      "V01/checkpoint-confirmed",
      "V01/canonical-committed",
      "V01/unsaved-lost",
      "V01/kill-live-fsync",
      "V01/kill-checkpoint-confirmation"
    ],
    "V02": [
      "V02/promoter-a-wins",
      "V02/promoter-b-wins",
      "V02/recreated-loser",
      "V02/validated-promotion"
    ],
    "V03": [
      "V03/recreated-saved-draft",
      "V03/stale-comparable",
      "V03/retain-variant",
      "V03/private-group-denied",
      "V03/guest-denied"
    ],
    "V04": [
      "V04/stop-fences-writer",
      "V04/replacement-fences-writer",
      "V04/space-switch-immutable",
      "V04/recreated-stale-writer",
      "V04/kill-before-publication"
    ],
    "V05": [
      "V05/exact-binary",
      "V05/manifest-binding",
      "V05/missing-byte-blocked",
      "V05/cross-scope-denied",
      "V05/checkpoint-not-knowledge-commit"
    ]
  }
}

,
"verify-lifecycle": {
  "positives": [
    "read",
    "forget",
    "propagate",
    "deny"
  ],
  "file": "components/verify-lifecycle.component.test.js",
  "cases": [
    "L01",
    "L02",
    "L04"
  ],
  "integration": true,
  "variants": {
    "L01": [
      "L01/every-class-expiry",
      "L01/expiry-read",
      "L01/expiry-publication",
      "L01/durable-tombstone"
    ],
    "L02": [
      "L02/durable-forget",
      "L02/repeat-forget",
      "L02/active-derived-counts",
      "L02/delivered-not-recalled",
      "L02/pending-retry"
    ],
    "L04": [
      "L04/nested-descendants",
      "L04/unaffected-branch",
      "L04/cycle-denied",
      "L04/missing-ancestor",
      "L04/depth-bound",
      "L04/fanout-bound",
      "L04/correction-current"
    ]
  }
}

,
"verify-propagation-retry": {
  "positives": [
    "read",
    "write",
    "deny",
    "propagate"
  ],
  "file": "components/verify-propagation-retry.component.test.js",
  "cases": [
    "L05",
    "L06",
    "L08"
  ],
  "integration": true,
  "variants": {
    "L05": [
      "L05/delete-restriction-first",
      "L05/delete-publication-first",
      "L05/expiry-restriction-first",
      "L05/expiry-publication-first",
      "L05/source-revoke-restriction-first",
      "L05/source-revoke-publication-first",
      "L05/correction-restriction-first",
      "L05/correction-publication-first",
      "L05/worker-restart",
      "L05/duplicate-job"
    ],
    "L06": [
      "L06/kill-invalidation-persisted",
      "L06/kill-descendant-written",
      "L06/kill-watermark",
      "L06/durable-pending",
      "L06/recreated-retry"
    ],
    "L08": [
      "L08/late-summary-old-revision",
      "L08/late-index",
      "L08/late-cache",
      "L08/canonical-preserved",
      "L08/stop-retains-storage"
    ]
  }
}

,
"verify-maintenance": {
  "positives": [
    "read",
    "write",
    "deny",
    "owner"
  ],
  "file": "components/verify-maintenance.component.test.js",
  "cases": [
    "L09"
  ],
  "integration": true,
  "variants": {
    "L09": [
      "L09/summary-admission",
      "L09/index-admission",
      "L09/cache-admission",
      "L09/budget-denied",
      "L09/blocked-wait-revalidation",
      "L09/duplicate-single-charge"
    ]
  }
}

,
"verify-lifecycle-races": {
  "positives": [
    "save",
    "ask",
    "forget",
    "read",
    "write",
    "deny",
    "conflict",
    "propagate",
    "owner"
  ],
  "file": "components/verify-lifecycle-races.component.test.js",
  "cases": [
    "L03",
    "L07"
  ],
  "integration": true,
  "variants": {
    "L03": [
      "L03/source-revoke-before-disclosure",
      "L03/source-revoke-after-disclosure",
      "L03/membership-remove-before-disclosure",
      "L03/membership-remove-after-disclosure",
      "L03/remaining-member-allowed",
      "L03/cache-blocked"
    ],
    "L07": [
      "L07/delete-restriction-first",
      "L07/delete-publication-first",
      "L07/expiry-restriction-first",
      "L07/expiry-publication-first",
      "L07/source-revoke-restriction-first",
      "L07/source-revoke-publication-first",
      "L07/correction-restriction-first",
      "L07/correction-publication-first",
      "L07/session-expiry-after-lock",
      "L07/member-expiry-after-lock",
      "L07/share-forward-first",
      "L07/share-reverse-first",
      "L07/kill-publication"
    ]
  }
}

});
export const controllerCases = freeze({G01: ['node g1-identity/scripts/check.mjs'], G02: ['node g1-foundations/scripts/check.mjs','node g1-foundations/scripts/check-retained.mjs'], G03: ['node g1-storage/scripts/check-evidence.mjs controller-behavior']});
export const externalCases = freeze({"X01": "pending", "X02": "pending", "X03": "pending", "X04": "pending", "X05": "pending", "X06": "pending", "X07": "pending", "X08": "pending", "X09": "pending"});
if (Object.values(suites).reduce((n,s)=>n+s.cases.length,0)!==64 || Object.keys(controllerCases).length!==3 || Object.keys(externalCases).length!==9) throw new Error('Frozen coverage registry corrupt');
