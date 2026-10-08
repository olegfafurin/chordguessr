import type { MessageKey } from './i18n';

interface Celebration { title: MessageKey; message: MessageKey; image: string; alt: MessageKey }
export const milestones: Record<number, Celebration> = {
  5: { title: 'A great beginning!', message: 'Well done!', image: '/milestones/5.svg', alt: 'A sprout growing from a piano key' },
  10: { title: 'Look at you go!', message: 'Keep it up!', image: '/milestones/10.svg', alt: 'A flower surrounded by musical notes' },
};

export const completionCelebration: Celebration = {
  title: 'A musical triumph!',
  message: 'Most impressive!',
  image: '/milestones/15.svg',
  alt: 'A golden star above a celebratory piano',
};
