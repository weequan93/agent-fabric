# G1-local quickstart

This is the synthetic local subbatch: deterministic-test model, synthetic-only effects, local-test identities, no paid calls or remote computer. Build, native installation and UI interaction are separate evidence. Complete G1 Linux/PG/Temporal/SSO/billing/physical-device/signing qualification remains pending.

## Independent installs and startup

Use Node22.22.3 and pnpm10.18.0. Root G0 source, lock and checks are frozen. Each local core/Web/Desktop/Mobile directory has its own lock. Run these from the repository root; a populated local store can satisfy the offline installs. A missing cached package is a specific dependency gap, not permission to change a lock.

```sh
pnpm --dir g1-local --ignore-workspace install --offline --frozen-lockfile --store-dir /private/tmp/agent-fabric-pnpm-store
pnpm --dir g1-local/web --ignore-workspace install --offline --frozen-lockfile --store-dir /private/tmp/agent-fabric-pnpm-store
node g1-local/scripts/build.mjs
node g1-local/scripts/local-start.mjs
```

The launcher starts exactly two child processes: API at `http://127.0.0.1:8791` and Vite at `http://127.0.0.1:5173`. API allows the exact localhost/127.0.0.1 Vite5173 origins. State lives in `g1-local/node_modules/.cache/g1-local-state`, separately from the disposable compiled build. A busy port fails without taking over or killing another service. Ctrl+C forwards SIGINT to both children, then bounded SIGTERM if needed, preserving SQLite files. No automatic restart, public bind, provider/SSH/enrollment option exists. A sandbox that prohibits loopback listening needs the host's scoped execution approval.

Open the Web origin and use the synthetic login accounts from `g1-local/src/identity.ts`: operator/operator-local-test, approver/approver-local-test, viewer/viewer-local-test, outsider/outsider-local-test. These fixtures are explicitly public test credentials, not production authentication. Operator creates tasks; the distinct approver approves the existing exact plan. Ask produces a deterministic answer; Plan/Act wait at the approval boundary. The owner explicitly starts a synthetic Run after approval. Inspect the same Task ID, revisions, test labels and committed result in every client. CurrentSpace navigation does not retarget an existing task.

Stop advances the current fence even when the displayed revision is old. Offline Stop displays Not delivered; uncertain acknowledgement displays unknown. Reconnect only reads. Query the original command through `LocalClient.queryCommand(commandId, originalSpaceId)` before deciding on another action. An unknown effect is reconciled by original receipt; repeating a command cannot become a new effect.

## Desktop

```sh
pnpm --dir g1-local/desktop --ignore-workspace install --offline --frozen-lockfile --store-dir /private/tmp/agent-fabric-pnpm-store
node g1-local/desktop/scripts/check.mjs
```

The Electron package uses its pinned vendor artifact; an offline pnpm install alone does not guarantee that the Electron executable archive is cached. If missing, perform the package's explicit vendor bootstrap with host authorization and retain the actual artifact/version result; do not use a different Electron version or imply an actual launch from a source test. Launch the desktop's pinned executable/main entry against the already-running Web/API. Renderer Node access, IPC/navigation and previews stay restricted. Actual launch and same-Task interaction are separately recorded by the UI executor.

## Android native build and emulator connection

```sh
pnpm --dir g1-local/mobile --ignore-workspace install --offline --frozen-lockfile --store-dir /private/tmp/agent-fabric-pnpm-store
node g1-local/mobile/scripts/check.mjs
GRADLE_USER_HOME=/private/tmp/agent-fabric-gradle-cache node g1-local/mobile/scripts/check.mjs --native
```

The checker copies the eight pinned mobile input files and three shared browser-safe SDK files into `/private/tmp/agent-fabric-g1-native-*/g1-local/mobile`, computes nativeInputDigest, supplies generated-copy Metro watchFolders, creates a real Android-platform Hermes bundle, and runs Expo Android prebuild plus arm64 debug Gradle build only in that temporary project. Nothing generates Android source or an APK into the accepted source tree. Native input digest and APK SHA bind the actual generated input/artifact; a source or dependency change requires a fresh build.

Prerequisites are actual Java17, Android SDK36, needed NDK/toolchain and an arm64 emulator. The initial Gradle wrapper/plugins/toolchain may need official vendor downloads; restricted-network failures require exact host permission, not silent alternate versions. The checker has a fixed 600-second overall bound; a timeout is a failed/pending build, never an APK pass. Metro/Hermes success alone is not an installed application.

After an actual APK path is reported, use that exact generated project for Android Studio and the actual artifact for installation. These are operator steps, not evidence that installation/UI already occurred:

```sh
adb -s emulator-5554 reverse tcp:8791 tcp:8791
adb -s emulator-5554 reverse tcp:8081 tcp:8081
adb -s emulator-5554 install -r <actual-app-debug.apk>
adb -s emulator-5554 shell am start -n com.agentfabric.g1local/.MainActivity
```

For a development-client build, start the generated project's pinned Expo dev server on localhost8081 and open it from the installed client; use the generated Metro configuration, not a different source copy. The mobile API remains `http://127.0.0.1:8791` over explicit adb reverse. Android emulator installation/native launch/touch interaction must be captured separately by the UI executor. Expo Go, a browser narrow viewport and screenshots without interaction do not qualify. Debug builds do not qualify physical devices, signed production distribution or updates.

## Evidence and current limits

Run the unchanged staged checker and G0 protection checks for the current integrated candidate. The verification package records actual command outputs, source/input digests, environment, failures, restart/unknown recovery, UI flows and bounded warm read measurements. Documentation and professional observations do not replace the registered independent evaluations. Native build status from this operations assignment is recorded in the recovery document; install/UI status remains owned by the root's actual executor.
