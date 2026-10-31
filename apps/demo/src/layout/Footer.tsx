import { Link } from '../route/Link';
import { REPO_URL, SERIES_URL } from './Header';

/** Small footer on every page. Links are 44 px tall; the text is gray-11 on the page background (about 8:1). */
export function Footer() {
  return (
    <footer className="k-footer">
      <nav aria-label="Footer">
        <ul className="k-footer__list">
          <li>
            <Link to="/privacy">Privacy</Link>
          </li>
          <li>
            <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">
              Apache-2.0<span className="k-sr-only"> (opens in a new tab)</span>
            </a>
          </li>
          <li>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              GitHub<span className="k-sr-only"> (opens in a new tab)</span>
            </a>
          </li>
          <li>
            <a href={SERIES_URL} target="_blank" rel="noopener noreferrer">
              Part of Sensing UI<span className="k-sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        </ul>
      </nav>
    </footer>
  );
}
