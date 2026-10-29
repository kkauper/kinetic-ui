# Brand

`logo.svg` is the Kinetic UI logo: a simplified gyroscope (gimbal circle, a tilted ring, an axle that sticks out above and below). It is an original drawing, part of this repository under Apache-2.0.

- 24x24 viewBox, single strokes (`stroke="currentColor"`, width 1.5, round caps and joins), geometry within 2-22 so it stays legible at 16 px.
- The lower half of the ring passes in front of the axle (the axle is broken there); the upper half passes behind it.

## Exports

`npm run icons -w @kinetic-ui/spec` (or `npm run icons` in `packages/spec`) renders the PNGs from the master with Playwright:

- `apps/demo/public`: `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`
- `native/apple/Demo/KineticDemo/Assets.xcassets/AppIcon.appiconset`: `AppIcon.png`, `AppIcon-dark.png` (1024 px)

The script resolves Playwright through Node's normal resolution; if it is installed globally, set `NODE_PATH` to the global `node_modules` folder. Hand-maintained copies of the geometry (keep in sync when the master changes): `apps/demo/public/favicon.svg`, `apps/demo/src/layout/icons.tsx` (`LogoMark`), and the Android vector `native/android/demo/src/main/res/drawable/ic_launcher_foreground.xml`.
