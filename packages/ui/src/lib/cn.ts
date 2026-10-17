import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Özel radius/shadow token'larımızı tailwind-merge'e tanıtır (çakışan sınıflar doğru birleşsin).
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      rounded: [{ rounded: ['control', 'card', 'modal'] }],
      shadow: [{ shadow: ['card', 'popover'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
