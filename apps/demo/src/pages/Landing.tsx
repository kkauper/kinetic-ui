import { useEffect, useRef, useState } from 'react';
import { Tabs } from '@radix-ui/themes';
import { Pill } from '../ui/Pill';
import { copyText } from '../ui/copyText';
import { Header, REPO_URL } from '../layout/Header';
import { usePageFocus } from '../route/usePageFocus';

interface Snippet {
  id: string;
  label: string;
  language: string;
  code: string;
}

// Taken from the README ("The store contract" and "Native").
const SNIPPETS: Snippet[] = [
  {
    id: 'react',
    label: 'React',
    language: 'tsx',
    code: `import { createFormModel, createMotionStore, signupSchema } from '@kinetic-ui/core';
import { useFormModel, useMotion } from '@kinetic-ui/react';

const motion = createMotionStore();
const form = createFormModel(signupSchema);

function Signup() {
  const { state } = useMotion(motion); // 'still' | 'moving'
  const { answers, currentStep } = useFormModel(form);
  return state === 'moving' ? <Stepper step={currentStep} /> : <FullForm answers={answers} />;
}`,
  },
  {
    id: 'swiftui',
    label: 'SwiftUI',
    language: 'swift',
    code: `import KineticUI

let motion = MotionStore(source: ActivitySource())
let form = FormStore() // sign-up schema, answers persist in UserDefaults

ContentView()
    .kineticMotion(motion)

struct ContentView: View {
    @Environment(\\.motionState) private var motionState // .still or .moving
    var body: some View { /* stepper when .moving, full form when .still */ }
}`,
  },
  {
    id: 'compose',
    label: 'Jetpack Compose',
    language: 'kotlin',
    code: `val store = MotionStore(source = ActivityTransitionSource(context))
val form = FormStore(storage = SharedPreferencesFormStorage(context))

KineticMotionProvider(store) {
    val state = LocalMotionState.current // MotionState.STILL or MOVING
    // stepper when MOVING, full form when STILL
}`,
  },
];

function CodeBlock({ snippet, onCopied }: { snippet: Snippet; onCopied: (message: string) => void }) {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  async function copy() {
    const ok = await copyText(snippet.code);
    if (ok) {
      onCopied(`Copied ${snippet.label} snippet`);
      setCopied(true);
      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 1500);
    } else {
      onCopied('Could not copy. The code is selected: copy it by hand.');
      // Select the code so the user can copy it right away.
      if (codeRef.current) window.getSelection()?.selectAllChildren(codeRef.current);
    }
  }
  return (
    <div className="k-code">
      <div className="k-code__bar">
        <span className="k-code__lang">{snippet.language}</span>
        {/* The visible text stays "Copy" (it is part of the accessible name, WCAG 2.5.3); the check icon confirms. */}
        <Pill
          type="button"
          size="1"
          variant="soft"
          color="gray"
          className="k-copy"
          aria-label={`Copy ${snippet.label} snippet`}
          onClick={copy}
        >
          {copied ? (
            <svg
              aria-hidden="true"
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 8.5l3.2 3.2L13 4.5" />
            </svg>
          ) : null}
          Copy
        </Pill>
      </div>
      {/* Scrollable region: focusable so keyboard users can scroll it with the arrow keys. */}
      <pre className="k-code__pre" tabIndex={0} aria-label={`${snippet.label} code example`}>
        <code ref={codeRef}>{snippet.code}</code>
      </pre>
    </div>
  );
}

export function Landing() {
  const h1 = usePageFocus<HTMLHeadingElement>('Kinetic UI');
  const titleSlot = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState('');

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function announce(message: string) {
    // Clear first so repeating the same message is announced again; hide the visual toast after a moment.
    clearTimeout(timer.current);
    setAnnouncement('');
    timer.current = setTimeout(() => {
      setAnnouncement(message);
      timer.current = setTimeout(() => setAnnouncement(''), 2500);
    }, 50);
  }

  return (
    <>
      <Header title={{ ref: h1, slot: titleSlot }} />
      <main className="k-landing">
        <section className="k-hero">
          {/* Empty: the page's h1 (in the fixed header) is drawn over this space, see layout/Header. */}
          <div ref={titleSlot} className="k-hero__title-slot" aria-hidden="true" />
          <p className="k-hero__intro">
            Interfaces that notice when you walk. A small headless model reads the phone&apos;s motion and tells your
            views whether the user is moving, so a form can switch from the full layout to one question at a time, with
            bigger targets in the thumb zone. Input for any view or framework.
          </p>
        </section>

        <Tabs.Root defaultValue="preview" className="k-tabs">
          <Tabs.List className="k-tabs__list" aria-label="Sections" size="2">
            <Tabs.Trigger value="preview">Preview</Tabs.Trigger>
            <Tabs.Trigger value="install">Install</Tabs.Trigger>
            <Tabs.Trigger value="license">License</Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="preview" className="k-tabs__panel">
            <div className="k-card">
              <h2 className="k-card__title">Try the live demo</h2>
              <p className="k-card__text">
                On a phone, tap Start and then Walking mode, and walk for a few seconds. On a computer, use Simulate
                walking.
              </p>
              <p className="k-card__text k-card__text--muted">
                Walking mode needs HTTPS, and on iPhone it asks for motion access once.
              </p>
              <a className="k-pill-link k-pill-link--primary" href="#/demo">
                Start the demo
              </a>
            </div>
          </Tabs.Content>

          <Tabs.Content value="install" className="k-tabs__panel">
            <p className="k-card__text">
              Not published to a package registry yet. Clone the repository and use the packages from the workspace; the
              snippets show the wiring.
            </p>
            <Tabs.Root defaultValue="react">
              <Tabs.List className="k-tabs__list k-tabs__list--sub" aria-label="Framework" size="1">
                {SNIPPETS.map((s) => (
                  <Tabs.Trigger key={s.id} value={s.id}>
                    {s.label}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
              {SNIPPETS.map((s) => (
                <Tabs.Content key={s.id} value={s.id} className="k-tabs__panel">
                  <CodeBlock snippet={s} onCopied={announce} />
                </Tabs.Content>
              ))}
            </Tabs.Root>
          </Tabs.Content>

          <Tabs.Content value="license" className="k-tabs__panel">
            <p className="k-card__text">
              Apache License 2.0 · Copyright 2026 Kai Kauper ·{' '}
              <a className="k-link" href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">
                Read the LICENSE file on GitHub<span className="k-sr-only"> (opens in a new tab)</span>
              </a>
            </p>
          </Tabs.Content>
        </Tabs.Root>

        <div className="k-sr-only" role="status" aria-live="polite">
          {announcement}
        </div>
        {announcement ? (
          <p className="k-toast" aria-hidden="true">
            {announcement}
          </p>
        ) : null}

        <section className="k-section" aria-labelledby="model-heading">
          <h2 id="model-heading" className="k-section__title">
            The model
          </h2>
          <ul className="k-facts">
            <li>
              <strong>What it reads.</strong> The accelerometer&apos;s step cadence on the web, and the operating
              system&apos;s activity classifier on iOS and Android.
            </li>
            <li>
              <strong>What it answers.</strong> Still or moving. It switches to moving after about 3 seconds of walking
              and back after about 10 seconds of not walking, so a pause at a crossing does not flip the screen.
            </li>
            <li>
              <strong>The walking band.</strong> Walking is a cadence between a minimum and a maximum. Slower, or faster
              (running, a bumpy ride), counts as not walking and keeps the full form.
            </li>
            <li>
              <strong>The escape hatch.</strong> While moving, &quot;Show full form&quot; is always one tap away.
              Detection will be wrong sometimes; the user stays in control.
            </li>
          </ul>
          <p className="k-meta">@kinetic-ui/core · TypeScript · Rust core for iOS and Android · Apache-2.0</p>
        </section>
      </main>
    </>
  );
}
