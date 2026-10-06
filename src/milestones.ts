interface Celebration { title: string; message: string; image: string; alt: string }
export const milestones: Record<number, Celebration> = {
  5: { title: 'Отличное начало!', message: 'Умничка!', image: '/milestones/5.svg', alt: 'A sprout growing from a piano key' },
  10: { title: 'Вот это да!', message: 'Так держать!', image: '/milestones/10.svg', alt: 'A flower surrounded by musical notes' },
};

export const completionCelebration: Celebration = {
  title: 'Музыкальный триумф!',
  message: 'Не только красивая, но ещё и музыкально одарённая!',
  image: '/milestones/15.svg',
  alt: 'A golden star above a celebratory piano',
};
