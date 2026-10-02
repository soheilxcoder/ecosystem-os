/**
 * `next/link` shim for the static showcase — renders a real anchor whose click
 * swaps the hash path instead of doing a network navigation.
 */
import { forwardRef, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { navigate } from '../router';

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string;
  children?: ReactNode;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, onClick, children, prefetch: _p, replace: _r, scroll: _s, ...rest },
  ref,
) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return; // let the browser handle modified clicks
    }
    event.preventDefault();
    navigate(href);
  };

  return (
    <a ref={ref} href={`#${href}`} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
});

export default Link;
