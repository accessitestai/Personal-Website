# \_archived

Files that are no longer part of the live site or its test suite but
that we keep in the repo so the intent and history remain findable.
Nothing here is served by Netlify (the folder is a leading-underscore
directory, which Netlify treats as private by convention; the sitemap
generator in `build.js` also skips it).

## screen-reader.js (moved 2026-07-10)

Was a 1,600-line web-based screen reader emulator that shipped in the
site's Accessibility Settings panel. Deprecated because a web
emulator cannot accurately model NVDA / JAWS behaviour and it was
letting sighted developers convince themselves they understood the
blind experience without installing the real thing. If you are here
to test screen reader behaviour, install NVDA (free, nvaccess.org)
or use VoiceOver (built into macOS).

## screen-reader.spec.js (moved 2026-07-10)

The Playwright test suite for the emulator above. Kept alongside the
implementation so if we ever revive the code the tests come back
with it.
