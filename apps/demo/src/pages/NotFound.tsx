import { Header } from '../layout/Header';
import { Link } from '../route/Link';
import { usePageFocus } from '../route/usePageFocus';

export function NotFound() {
  const h1 = usePageFocus<HTMLHeadingElement>('Page not found · Kinetic UI');
  return (
    <>
      <Header />
      <main className="k-page k-prose">
        <h1 ref={h1} tabIndex={-1} className="k-prose__title">
          Page not found
        </h1>
        <p>There is no page at this address.</p>
        <p>
          <Link className="k-pill-link k-pill-link--primary" to="/">
            Back to the home page
          </Link>
        </p>
      </main>
    </>
  );
}
