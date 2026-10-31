import { Header } from '../layout/Header';
import { PRIVACY_CONTACT_EMAIL } from '../legal/contact';
import { usePageFocus } from '../route/usePageFocus';

const CLOUDFLARE_POLICY = 'https://www.cloudflare.com/privacypolicy/';

function External({ href, children }: { href: string; children: string }) {
  return (
    <a className="k-link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="k-sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export function Privacy() {
  const h1 = usePageFocus<HTMLHeadingElement>('Privacy · Kinetic UI');
  return (
    <>
      <Header />
      <main className="k-page k-prose">
        <h1 ref={h1} tabIndex={-1} className="k-prose__title">
          Privacy
        </h1>

        <p className="k-prose__summary">
          <strong>In short:</strong> this is a playground. Nothing you type or how you move leaves your device. No
          cookies, no tracking.
        </p>

        <h2>Who is responsible</h2>
        <p>
          Kinetic UI is a public, non-commercial portfolio project. Kai Kauper is the controller of this website in the
          sense of the GDPR. You can reach me at{' '}
          <a className="k-link" href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>
            {PRIVACY_CONTACT_EMAIL}
          </a>
          .
        </p>

        <h2>What happens on your device</h2>
        <p>
          The demo has no backend. Everything below happens in your browser, on your own device. I never receive it.
        </p>
        <h3>The sign-up form</h3>
        <p>&quot;Create account&quot; only checks your answers. It sends nothing anywhere.</p>
        <p>
          So that your answers survive a reload, the demo saves them in your browser&apos;s localStorage under the key{' '}
          <code>kinetic-ui:signup</code>. They are removed when you choose &quot;Start over&quot;, when you choose
          &quot;Clear saved answers&quot; in the debug sheet, or when you clear this site&apos;s data in your browser.
        </p>
        <p>
          The debug sheet remembers one preference the same way: whether to keep the status readout on screen (
          <code>kinetic-ui:debug-readout</code>). Clearing this site&apos;s data in your browser removes it.
        </p>
        <p>These two keys are the only things the site stores in your browser.</p>
        <h3>Motion sensor</h3>
        <p>
          In Walking mode the demo reads your phone&apos;s accelerometer (through the browser&apos;s DeviceMotionEvent)
          to detect whether you are walking. This happens only in your browser and the data is never sent anywhere.
          Your browser may ask for permission first.
        </p>
        <p>
          The optional &quot;Record 20 s&quot; trace in the debug sheet stays on your device, unless you copy or
          download it yourself.
        </p>
        <h3>The iOS and Android demo apps</h3>
        <p>
          The demo apps for iOS and Android are not distributed through app stores. They process motion and activity
          data on the device only. Answers and the "keep readout on screen" setting of the debug sheet are stored on the device
          (UserDefaults on iOS, SharedPreferences on Android). Nothing is sent, and there is no analytics.
        </p>

        <h2>Hosting (Cloudflare)</h2>
        <p>
          Cloudflare, Inc. delivers this website. Like any web host, Cloudflare processes technical connection data,
          for example your IP address, your browser&apos;s user agent and the time of the request, to deliver pages and
          to protect against attacks. Cloudflare acts as my processor.
        </p>
        <p>
          Cloudflare also sends a Network Error Logging header. If a page fails to load, your browser may send a
          technical failure report to Cloudflare. It contains no page content and no form data.
        </p>
        <p>
          I do not have access to Cloudflare&apos;s logs for analytics, and I do not use Cloudflare Web Analytics.
        </p>
        <p>
          Your data may be processed outside the EU. Cloudflare states in its privacy policy that it complies with the
          EU-U.S. Data Privacy Framework (and its UK Extension and the Swiss-U.S. framework). Details are in{' '}
          <External href={CLOUDFLARE_POLICY}>Cloudflare&apos;s privacy policy</External>.
        </p>

        <h2>What I don&apos;t do</h2>
        <ul>
          <li>No cookies.</li>
          <li>No analytics and no tracking.</li>
          <li>No ads.</li>
          <li>No third-party scripts.</li>
          <li>No requests to Google or other third parties: the font (Hanken Grotesk) is hosted on this site.</li>
          <li>No accounts and no server that receives your answers or your motion data.</li>
        </ul>
        <p>
          The links to GitHub are plain links. If you follow one, GitHub&apos;s own privacy policy applies from then on.
        </p>

        <h2>Legal bases</h2>
        <ul>
          <li>
            <strong>Hosting and connection data:</strong> Art. 6(1)(f) GDPR. I have a legitimate interest in delivering
            a secure website.
          </li>
          <li>
            <strong>localStorage:</strong> it is strictly necessary to provide the function you use (saving your own
            answers, remembering your debug preference). The data never leaves your device. A consent banner is
            therefore not needed under Art. 5(3) of the ePrivacy Directive and, in Germany, § 25(2) TDDDG.
          </li>
        </ul>

        <h2>Your rights</h2>
        <p>
          Under the GDPR you have the right to access, rectification, erasure, restriction of processing, objection and
          data portability. You can also complain to a data protection supervisory authority, for example in your EU
          member state.
        </p>
        <p>
          The site itself stores nothing about you on a server, so most requests concern Cloudflare&apos;s technical
          logs. I cannot identify visitors from those logs, so I usually cannot link them to you. Data in your
          browser is under your control: you can delete it at any time, as described above.
        </p>

        <h2>Contact</h2>
        <p>
          Questions or requests about privacy:{' '}
          <a className="k-link" href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>
            {PRIVACY_CONTACT_EMAIL}
          </a>
          .
        </p>

        <h2>Last updated</h2>
        <p>
          <time dateTime="2026-10-29">29 October 2026</time>.
        </p>
      </main>
    </>
  );
}
