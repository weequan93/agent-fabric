# G1-local recovery

The persistent owner is actual local SQLite; separate model/effect ledgers hold original synthetic receipts. This is local synthetic recovery evidence, not PostgreSQL/RLS, Temporal HA, remote rollback or production backup qualification.

Stop the owned launcher with Ctrl+C. Do not kill a different process to free a port, delete the state directory, regenerate identities or reset reservations to make a recovery test pass. Confirm the owned API/Web child exits; restart with the same state directory. The launcher does not erase state. A forced process death can leave WAL files; preserve the database with its WAL/SHM while stopped and let SQLite recover the same owner state. Do not copy only a live main .sqlite file as an asserted complete backup.

On startup the service loads current identities, sessions, memberships, sources, tombstones, versioned Task/Run and immutable receipts. An invoked/dispatched action without settled owner evidence is restored as unknown; it is not blindly resent. Pure read/event replay performs zero model/effect callbacks. Login as an allowed test identity and retrieve the original Task ID. Reauthorize current scope and source audiences; cached access cannot survive revocation.

For lost client acknowledgements, retain commandId and original Space/Task. Known-offline requests have Not delivered and no server command; network acknowledgement loss may have committed and remains unknown. `queryCommand` reads the original scoped receipt under the current actor and source authority. Reconnect preserves unsent drafts and never auto-submits. A Stop already accepted has advanced its durable fence; repeat with the same key is idempotent. Old-generation callbacks cannot publish over the replacement.

For unknown model/effect usage, issue an explicit owner `reconcile` command with the original operationId. A trusted lookup of the independent receipt settles the original reservation once. Missing proof keeps unknown and the reservation held. A known receipt after Stop can settle accounting without authorizing publication or reversing an effect. An unavailable approver, expired/changed plan or source policy requires a new exact binding; old approval is never revived. Terminal attempts remain immutable; authorized retry creates a fresh Run and approval request.

Committed results require scoped bytes/digest/manifest consistency. Partial state does not appear as a result. Restore current revocation/deletion tombstones before any artifact or late outbox publication. Never interpret a snapshot as reversal of an externally committed action; all effects here are explicitly synthetic.

## Native-build record

At 2026-10-05 06:28 UTC the actual command below passed strict mobile TypeScript, all eight component/shared SDK tests, and Android Metro/Hermes export (575 modules, 1.7 MB). Expo prebuild generated `/private/tmp/agent-fabric-g1-native-iKH5UY/g1-local/mobile/android`. The Gradle wrapper then failed before APK creation with `java.net.UnknownHostException: services.gradle.org` while fetching its configured `https://services.gradle.org/distributions/gradle-9.0.0-bin.zip`.

```sh
GRADLE_USER_HOME=/private/tmp/agent-fabric-gradle-cache \
JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home \
node g1-local/mobile/scripts/check.mjs --native
```

The copied eleven native inputs have `nativeInputDigest` `sha256:ac5e746ef2d6b711f947a412cbccc54a599db013c4340498e88e8838026fbe20`, calculated with the checker's ordered path/content-digest algorithm. This digest identifies source inputs and does not prove an APK exists.

The exact command was subsequently approved for official build dependency access and rerun. At 06:30 UTC its actual process session `6396` remained active; the rerun had again passed the eight tests, Android bundle and prebuild, creating `/private/tmp/agent-fabric-g1-native-eLBZ2f/g1-local/mobile/android`. No successful Gradle completion or APK SHA had been observed at that checkpoint. Installation, emulator interaction, physical-device support and signing/distribution remain separate and unverified by this document.

A failed Gradle wrapper download, SDK toolchain or sandbox write records its exact error and resumption condition. Preserve the generated temporary project/log and original deadline. Repeating a check creates a new temporary project; do not silently replace source/dependency versions or claim the earlier failure passed. If a timed build is still active at the worker deadline, hand over its actual process/session and generated path to the coordinator with remaining work explicit.
