// Builds generated/tokens.css, KineticTokens.swift and KineticTokens.kt from
// tokens/kinetic.tokens.json (DTCG) with Style Dictionary. Run: npm run tokens.
import StyleDictionary from 'style-dictionary';

const HEADER = 'Generated from tokens/kinetic.tokens.json by `npm run tokens` in @kinetic-ui/spec. Do not edit.';

/** [mode, name, px, description] for every token, `still` before `moving`. */
function rows(dictionary) {
  return dictionary.allTokens.map((token) => {
    const [mode, name] = token.path;
    return { mode, name, px: Number.parseFloat(token.$value), description: token.$description ?? '' };
  });
}

const kebab = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const upperFirst = (s) => s[0].toUpperCase() + s.slice(1);
const byMode = (all, mode) => all.filter((row) => row.mode === mode);
/** Type-size tokens are font sizes (sp on Android); everything else is a length (dp). */
const isFont = (name) => name.startsWith('font');

const sd = new StyleDictionary({
  usesDtcg: true,
  source: ['tokens/kinetic.tokens.json'],
  hooks: {
    formats: {
      'kinetic/css': ({ dictionary }) => {
        const all = rows(dictionary);
        const block = (selector, mode) =>
          `${selector} {\n${byMode(all, mode)
            .map((r) => `  --k-${kebab(r.name)}: ${r.px}px;`)
            .join('\n')}\n}\n`;
        return `/* ${HEADER} */\n${block(':root', 'still')}\n${block("[data-motion='moving']", 'moving')}`;
      },
      'kinetic/swift': ({ dictionary }) => {
        const all = rows(dictionary);
        const group = (mode) =>
          `  public enum ${upperFirst(mode)} {\n${byMode(all, mode)
            .map((r) => `    public static let ${r.name}: CGFloat = ${r.px}`)
            .join('\n')}\n  }\n`;
        return `// ${HEADER}\n\nimport CoreGraphics\n\n/// Points equal CSS px.\npublic enum KineticTokens {\n${group('still')}\n${group('moving')}}\n`;
      },
      'kinetic/kotlin': ({ dictionary }) => {
        const all = rows(dictionary);
        const group = (mode) =>
          `    object ${upperFirst(mode)} {\n${byMode(all, mode)
            .map((r) => `        val ${r.name} = ${r.px}.${isFont(r.name) ? 'sp' : 'dp'}`)
            .join('\n')}\n    }\n`;
        return `// ${HEADER}\npackage ui.kinetic.tokens\n\nimport androidx.compose.ui.unit.dp\nimport androidx.compose.ui.unit.sp\n\nobject KineticTokens {\n${group('still')}\n${group('moving')}}\n`;
      },
    },
  },
  // name/camel makes names unique per mode (stillTargetMin vs movingTargetMin); the formats read token.path.
  platforms: {
    css: {
      transforms: ['name/camel'],
      buildPath: 'generated/',
      files: [{ destination: 'tokens.css', format: 'kinetic/css' }],
    },
    swift: {
      transforms: ['name/camel'],
      buildPath: 'generated/',
      files: [{ destination: 'KineticTokens.swift', format: 'kinetic/swift' }],
    },
    kotlin: {
      transforms: ['name/camel'],
      buildPath: 'generated/',
      files: [{ destination: 'KineticTokens.kt', format: 'kinetic/kotlin' }],
    },
  },
});

await sd.buildAllPlatforms();
