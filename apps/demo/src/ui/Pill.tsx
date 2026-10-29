import { forwardRef } from 'react';
import { Button } from '@radix-ui/themes';
import type { ComponentPropsWithoutRef, ElementRef } from 'react';

/**
 * The only button of the demo: Radix Button with the pill shape fixed.
 * Setting the radius here instead of on the Theme keeps inputs and cards on the theme radius.
 */
export const Pill = forwardRef<ElementRef<typeof Button>, ComponentPropsWithoutRef<typeof Button>>(function Pill(
  props,
  ref,
) {
  return <Button {...props} ref={ref} radius="full" />;
});
