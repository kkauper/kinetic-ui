import { Theme } from '@radix-ui/themes';
import { useMotionAttribute } from '@kinetic-ui/react';
import { Demo } from './pages/Demo';
import { Landing } from './pages/Landing';
import { Footer } from './layout/Footer';
import { NotFound } from './pages/NotFound';
import { Privacy } from './pages/Privacy';
import { useRoute } from './route/router';
import { motionStore } from './stores';
import { useKeyboardInset } from './ui/useKeyboardInset';
import { useUiSize } from './ui/useUiSize';

function Shell() {
  const route = useRoute();
  useMotionAttribute(motionStore);
  useKeyboardInset();

  return (
    <div className="k-app">
      {route === 'demo' ? <Demo /> : route === 'privacy' ? <Privacy /> : route === 'landing' ? <Landing /> : <NotFound />}
      <Footer />
    </div>
  );
}

/** Radix Theme scaling follows the motion state; the mapping lives in useUiSize. */
export function App() {
  const { scaling } = useUiSize();
  return (
    <Theme appearance="dark" accentColor="blue" grayColor="slate" radius="large" scaling={scaling}>
      <Shell />
    </Theme>
  );
}
