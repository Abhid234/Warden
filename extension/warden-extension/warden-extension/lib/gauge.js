/**
 * lib/gauge.js
 * Draws the needle gauge used in both the popup and the options page.
 * UI-only — has no opinion on what the levels mean.
 */

const GAUGE_ANGLES = [-72, -36, 0, 36, 72];
const GAUGE_COLORS = ['#4F6F52', '#6B9171', '#C99A3B', '#B5533C', '#8C4432'];

function drawGauge(svgEl, currentLevel) {
  const ns = 'http://www.w3.org/2000/svg';
  svgEl.innerHTML = '';
  const cx = 100, cy = 105;

  GAUGE_ANGLES.forEach((angle, i) => {
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', 100); line.setAttribute('y1', 45);
    line.setAttribute('x2', 100); line.setAttribute('y2', 22);
    line.setAttribute('stroke', GAUGE_COLORS[i]);
    line.setAttribute('stroke-width', i === currentLevel ? 7 : 5);
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('opacity', i === currentLevel ? 1 : 0.45);
    line.setAttribute('transform', `rotate(${angle} ${cx} ${cy})`);
    svgEl.appendChild(line);
  });

  const base = document.createElementNS(ns, 'circle');
  base.setAttribute('cx', cx); base.setAttribute('cy', cy); base.setAttribute('r', 7);
  base.setAttribute('fill', '#39443F');
  svgEl.appendChild(base);

  const needle = document.createElementNS(ns, 'line');
  needle.setAttribute('x1', cx); needle.setAttribute('y1', cy);
  needle.setAttribute('x2', cx); needle.setAttribute('y2', 28);
  needle.setAttribute('stroke', '#EDEAE2');
  needle.setAttribute('stroke-width', 3);
  needle.setAttribute('stroke-linecap', 'round');
  needle.setAttribute('transform', `rotate(${GAUGE_ANGLES[currentLevel]} ${cx} ${cy})`);
  svgEl.appendChild(needle);
}
