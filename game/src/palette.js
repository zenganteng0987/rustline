// The look plan, in one place: a container yard at dusk. Six base values (the same six
// names are the CSS custom properties in index.html) plus two team colours, and nothing
// else; the lighting makes every shade the game needs.
export const PALETTE = {
  canvas: '#0d1319',
  surface: '#1b2634',
  hairline: '#31455a',
  ink: '#f4efe4',
  muted: '#93a7b8',
  accent: '#ffb02e',
  attack: '#ff7a29',
  defend: '#4cc9e6',
  sky: '#1d3049',
  dusk: '#8a5a33',
};

export function shade(name) {
  return PALETTE[name];
}
