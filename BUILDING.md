# Rebuilding the Firefox package

This source archive builds the unsigned Firefox Desktop package with public,
open-source tooling. It includes the exact npm lockfile. No account, API key,
signing credential, Android SDK or external backend is needed to build it.

Use Node.js **24.10.0** and npm **11.6.0** to match the local verification environment.
Other supported Node releases may work but are not the recorded reproduction.
Use a normal Linux, macOS or Windows shell with npm available. Build prerequisites
are downloaded from the public npm registry by `npm ci`; after dependency
installation, compilation and packaging use local files.

Extract the source ZIP into an empty directory, then run from its root:

```sh
npm ci
npm run zip:firefox
```

The installed extension files are in `.output/firefox-mv3/`. The unsigned archive
is `.output/copy-as-context-0.0.0-firefox.zip`; the accompanying source archive is
`.output/copy-as-context-0.0.0-sources.zip`. Filenames use the package version, so
they change when the version changes. Compare uncompressed file paths and bytes
with the submitted extension ZIP; ZIP container timestamps are not build content.

For local package verification:

```sh
npm run check:firefox-package
NO_UPDATE_NOTIFIER=1 npm run lint:firefox
```

Use the source archive's `package-lock.json` and `npm ci`, without upgrading
dependencies or running `npm audit fix`. Build and test tools are development
dependencies; production code includes only the project and small WXT helpers.
Project MIT license and third-party notices are copied into every browser build.

The source ZIP uses an explicit allowlist. It excludes local plans and reports
in `dev_notes/`, `.git`, `.agents`, `.codex`, environment files, credentials,
`node_modules` and generated output. The archive is taken from the current local
source, including authorized uncommitted implementation files. WXT omits unit
test files from its reviewer archive; the build does not require those files.
Full contributor checks run from the repository with `npm run check`.

## Android research build

```sh
npm run build:firefox:android-test
```

This writes a separate `.output/firefox-mv3-android-test/` build with experimental
Android 142+ metadata and no unsupported `downloads` permission. The default
Desktop package has no `gecko_android` availability declaration. The probe is
copy-only, shows Save unavailable, and has not passed a real-device gate. It is
not the Firefox release package and must not be submitted as supported Android.

## Distribution status

Version `0.0.0` is a development version. Both archives are unsigned review
artifacts, not an AMO submission or approval. Signing, distribution channel,
final version, store listing and release evidence must be settled before
publication. See `docs/firefox-release.md` and `docs/firefox-android-testing.md`.
