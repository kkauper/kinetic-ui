import { useEffect, useRef } from 'react';
import { bindMotionAttribute } from '@kinetic-ui/core';
import type { MotionStore } from '@kinetic-ui/core';

const defaultTarget = (): Element => document.documentElement;

/** Mirrors the motion state onto an element attribute (default `<html data-motion>`). */
export function useMotionAttribute(
  store: MotionStore,
  getTarget: () => Element = defaultTarget,
  attribute?: string,
): void {
  // Keep the latest getter without re-binding when callers pass an inline function.
  const targetRef = useRef(getTarget);
  targetRef.current = getTarget;
  useEffect(() => bindMotionAttribute(store, targetRef.current(), attribute), [store, attribute]);
}
