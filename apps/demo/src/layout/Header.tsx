import { GitHubMark, LogoMark } from './icons';

export const REPO_URL = 'https://github.com/kkauper/kinetic-ui';

/** On every page: wordmark (home link) left, GitHub pill right. */
export function Header() {
  return (
    <header className="k-header">
      <a className="k-header__brand" href="#/" aria-label="Kinetic UI home">
        <LogoMark />
        <span aria-hidden="true">
          <span className="k-header__name">Kinetic</span>
          <span className="k-header__suffix"> UI</span>
        </span>
      </a>
      <a
        className="k-pill-link"
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Kinetic UI on GitHub (opens in a new tab)"
      >
        <GitHubMark />
        <span aria-hidden="true">GitHub</span>
      </a>
    </header>
  );
}
