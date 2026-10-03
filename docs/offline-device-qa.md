# Offline release QA

This checklist is required before calling an offline build production-ready.
The automated checks prove the shipped assets and browser contracts; the
device checks below prove storage, lifecycle, and airplane-mode behavior on
real hardware.

## Automated gate

Run from the repository root:

```bash
npm run verify:offline-release
npm run typecheck
npm run lint
npm run test:unit
npm run build
```

For browser/API smoke coverage, run the app in one terminal and the checks in
another:

```bash
npm run dev -- --port 3100
npm run test:languages
npm run test:api
```

The heavy model proof remains opt-in because it downloads about 912 MB:

```bash
npm run test:offline-app
```

## Android Chrome / installed PWA

Use a release build on a physical phone. Clear site data before each fresh
run, and record the phone model, Android version, Chrome version, free storage,
and whether the app is installed as a PWA.

- [ ] Install the PWA from the browser menu and reopen it from the home screen.
- [ ] While online, open Offline settings and confirm the shared pack shows its
      real size and a storage/memory warning when appropriate.
- [ ] Start the download, cancel after visible progress, then start it again.
      Progress must continue from the saved prefix instead of restarting the
      completed file.
- [ ] Let the shared pack finish; close and relaunch the PWA.
- [ ] Switch to Offline mode, enable airplane mode, and reload the app.
- [ ] Translate with an explicit supported source language and verify that the
      result completes without API or model-host requests.
- [ ] Use the Verify files action in the drawer and confirm the pack remains
      ready.
- [ ] Remove the pack, confirm the status resets, then download it again.
- [ ] Test an incoming phone call/background-resume during download if the
      device supports it.

## iPhone Safari / installed PWA

Repeat the same flow on the oldest supported iPhone available. Pay particular
attention to Safari storage eviction and app suspension:

- [ ] Install to the Home Screen and launch the standalone app.
- [ ] Confirm a canceled download resumes after Safari is reopened.
- [ ] Confirm the completed pack survives a force-close and relaunch.
- [ ] Confirm airplane-mode translation works after relaunch.
- [ ] Confirm the app explains when a device voice is unavailable; translation
      must not be presented as dependent on speech synthesis.
- [ ] Record any storage eviction or OS-kill behavior as a release limitation.

## Release acceptance

Ship only when every target device can download, resume, verify, remove, and
translate offline, and when any unsupported device shows a clear recovery
message instead of a silent network fallback. Keep the completed checklist
with the release build and pack manifest version.
