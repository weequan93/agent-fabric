| Task | Lead | Status | Minutes | Exact controller checks |
| --- | --- | --- | ---: | --- |
| f05-11 | tester | pending | 75 | `node g1-storage/scripts/check-slice.mjs authority` (900s); `node g1-storage/scripts/check-slice.mjs commit-conflict` (900s); `node g1-storage/scripts/check-slice.mjs lifecycle-propagation` (1800s); `node g1-storage/scripts/check-slice.mjs volume-draft` (900s); `node g1-storage/scripts/check-slice.mjs atomic-disconnect` (900s) |
| f05-12 | tester | pending | 25 | `node g1-storage/scripts/check-slice.mjs recall-ask` (1200s) |
| f05-13 | tester | pending | 25 | `node g1-storage/scripts/check-slice.mjs backup-restore` (1200s) |
| f05-14 | security | pending | 30 | `node g1-storage/scripts/check-slice.mjs owned-encryption` (900s); `node g1-storage/scripts/check-slice.mjs harness` (900s); `node g1-storage/scripts/check-slice.mjs authority` (900s); `node g1-storage/scripts/check-component.mjs security` (600s) |
| f05-15 | tester | pending | 75 | `node g1-storage/scripts/check-evidence.mjs local` (180s); `node g1-storage/scripts/check.mjs` (1800s); `node g1-identity/scripts/check.mjs` (600s); `node g1-foundations/scripts/check.mjs` (600s); `node g1-foundations/scripts/check-retained.mjs` (900s); `node g1-storage/scripts/check-evidence.mjs controller-behavior` (180s) |
| f05-12-recall | tester | pending | 75 | `node g1-storage/scripts/check-component.mjs verify-ask-recall` (900s) |
| f05-12-disclosure | tester | pending | 75 | `node g1-storage/scripts/check-component.mjs verify-ask-disclosure` (900s) |
| f05-12-routing | tester | pending | 110 | `node g1-storage/scripts/check-component.mjs verify-ask-routing` (900s); `node g1-storage/scripts/check-slice.mjs recall-ask` (1200s) |
| f05-13-current | tester | pending | 95 | `node g1-storage/scripts/check-component.mjs verify-restore-current` (900s) |
| f05-13-interruption | tester | pending | 85 | `node g1-storage/scripts/check-component.mjs verify-restore-interruption` (900s) |
| f05-13-integrity | tester | pending | 90 | `node g1-storage/scripts/check-component.mjs verify-restore-integrity` (900s) |
| f05-13-measurement | tester | pending | 110 | `node g1-storage/scripts/check-component.mjs verify-restore-measurement` (900s); `node g1-storage/scripts/check-slice.mjs backup-restore` (1200s) |
| f05-15-docs | tester | pending | 85 | `node g1-storage/scripts/check-component.mjs delivery-operations` (900s) |
| f05-15-evidence | tester | pending | 75 | `node g1-storage/scripts/check-component.mjs delivery-evidence` (900s) |
| f05-14-cipher | security | pending | 80 | `node g1-storage/scripts/check-component.mjs verify-encryption` (900s) |
| f05-14-copies | security | pending | 85 | `node g1-storage/scripts/check-component.mjs verify-retained-copies` (900s) |
| f05-11-atomic-disconnect | tester | pending | 110 | `node g1-storage/scripts/check-component.mjs verify-atomic-disconnect` (900s); `node g1-storage/scripts/check-component.mjs verify-atomic` (900s); `node g1-storage/scripts/check-component.mjs verify-knowledge` (900s); `node g1-storage/scripts/check-slice.mjs commit-conflict` (900s) |
| f05-11-suite-execution | tester | active | 110 | `node g1-storage/scripts/check-slice.mjs lifecycle-propagation` (1800s); `node g1-storage/scripts/check-slice.mjs volume-draft` (900s); `node g1-storage/scripts/check-component.mjs harness` (900s) |
| f05-15-schedule | tester | pending | 100 | `node g1-storage/scripts/check.mjs` (1800s) |
| f05-14-harness | tester | pending | 110 | `node g1-storage/scripts/check-slice.mjs delivery-audit` (900s); `node g1-storage/scripts/check-slice.mjs harness` (900s) |
| f05-11-full-predecessors | tester | active | 110 | `node g1-storage/scripts/check-slice.mjs lifecycle-propagation` (1800s); `node g1-storage/scripts/check-slice.mjs volume-draft` (900s); `node g1-storage/scripts/check-full-predecessor-composition.mjs` (120s); `node g1-storage/scripts/check-component.mjs harness` (900s) |
| f05-11-full-receipt-transport | tester | active | 65 | `node g1-storage/scripts/check-slice.mjs lifecycle-propagation` (1800s); `node g1-storage/scripts/check-slice.mjs volume-draft` (900s); `node g1-storage/scripts/check-full-predecessor-composition.mjs` (120s); `node g1-storage/scripts/check-component.mjs harness` (900s) |
| f05-11-receipt-boundaries | tester | pending | 65 | `node g1-storage/scripts/check-slice.mjs lifecycle-propagation` (1800s); `node g1-storage/scripts/check-slice.mjs volume-draft` (900s); `node g1-storage/scripts/check-full-predecessor-composition.mjs` (120s); `node g1-storage/scripts/check-component.mjs harness` (900s) |
