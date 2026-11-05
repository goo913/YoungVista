const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export const formatDate = (date: Date | null): string =>
  date ? dateFormat.format(date) : 'Just now';
