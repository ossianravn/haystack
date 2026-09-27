import type { PageSnapshot } from '../core/types';

export const samplePage: PageSnapshot = {
  id: 'preview-page', title: 'A field guide to slower travel', url: 'https://example.com/journal/slower-travel',
  passages: [
    { id: 'p0', heading: 'The cost of going further', text: 'The cheapest ticket is rarely the whole story. Overnight trains include a place to sleep, which can offset the cost of a hotel room. Seat reservations and local transfers are usually charged separately.' },
    { id: 'p1', heading: 'Before you book', text: 'A flexible fare costs more upfront, but allows you to change your plans without paying a new booking fee. Check whether the price includes luggage, meals, and a reserved seat.' },
    { id: 'p2', heading: 'Leave room for the unexpected', text: 'Set aside a small part of your budget for the unplanned: a missed connection, an extra night, or a detour you could not resist. The freedom to stay is part of the journey.' },
  ],
};
