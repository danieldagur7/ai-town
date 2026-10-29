import { useEffect, useState } from 'react';

// Toolbar menus open one at a time: opening one closes the others, and
// tapping the map closes whichever is open.
const EVENT = 'aitown-menu';

export function openMenu(name: string | null) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: name }));
}

export function useMenu(name: string): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOther = (e: Event) => setOpen((e as CustomEvent).detail === name);
    window.addEventListener(EVENT, onOther);
    return () => window.removeEventListener(EVENT, onOther);
  }, [name]);
  return [open, (next: boolean) => openMenu(next ? name : null)];
}
