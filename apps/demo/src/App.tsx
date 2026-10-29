import { Theme } from '@radix-ui/themes';
import { useMotionAttribute } from '@kinetic-ui/react';
import { Header } from './layout/Header';
import { Demo } from './pages/Demo';
import { Landing } from './pages/Landing';
import { useHashRoute } from './route/useHashRoute';
import { motionStore } from './stores';
import { useKeyboardInset } from './ui/useKeyboardInset';
import { useUiSize } from './ui/useUiSize';

function Shell() {
  const route = useHashRoute();
  useMotionAttribute(motionStore);
  useKeyboardInset();

  return (
    <div className="k-app">
      <Header />
      {route === 'demo' ? <Demo /> : <Landing />}
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
