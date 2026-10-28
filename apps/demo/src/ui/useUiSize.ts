import { useMotion } from '@kinetic-ui/react';
import { motionStore } from '../stores';

export interface UiSize {
  moving: boolean;
  /** Size for Radix TextField, Switch, RadioCards and Slider. */
  controlSize: '2' | '3';
  /** Size for Radix Button. */
  buttonSize: '3' | '4';
  /** Radix Theme `scaling`. */
  scaling: '100%' | '110%';
}

/** The single place that maps motion state to Radix size props. */
export function useUiSize(): UiSize {
  const moving = useMotion(motionStore).state === 'moving';
  return {
    moving,
    controlSize: moving ? '3' : '2',
    buttonSize: moving ? '4' : '3',
    scaling: moving ? '110%' : '100%',
  };
}
