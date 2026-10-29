# Fonts

Hanken Grotesk (variable, weight axis 100-900), bundled so no platform downloads fonts at runtime.

- Source: https://github.com/google/fonts/tree/main/ofl/hankengrotesk (`HankenGrotesk[wght].ttf`), design by the Hanken Grotesk Project Authors (https://github.com/marcologous/hanken-grotesk).
- Licence: SIL Open Font License 1.1, see `OFL.txt`. The font is not modified.
- The web demo uses the same family through `@fontsource-variable/hanken-grotesk`.
- Android copies this file to `native/android/demo/src/main/res/font/hanken_grotesk.ttf` (Android resource names must be lowercase with underscores).
- iOS copies this file to `native/apple/Demo/KineticDemo/Fonts/HankenGrotesk.ttf` (and `OFL.txt`) and registers it with `UIAppFonts` in `native/apple/Demo/project.yml`; the family name inside the file is "Hanken Grotesk".
