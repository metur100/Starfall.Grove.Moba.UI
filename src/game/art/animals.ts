// Tuft the fox and Fenn the wolf as paper pieces, for the hero stage (the world draws them with the same shapes).
import { TAU, circle, ellipse } from './color';

/** Tuft: a small orange fox sitting or trotting, facing right (mirror with `face`). */
export function paintFox(g: CanvasRenderingContext2D, t: number, face: 1 | -1, moving = false) {
  g.save(); g.scale(face, 1);
  const wag = Math.sin(t * (moving ? 14 : 5)) * .5, hop = moving ? Math.abs(Math.sin(t * 11)) * 6 : 0;
  g.translate(0, -hop);
  g.save(); g.translate(-9, -2); g.rotate(-.6 + wag); ellipse(g, -9, 0, 12, 6.5, '#d98a50'); ellipse(g, -18, 0, 5.2, 4.6, '#fff4e0'); g.restore();
  ellipse(g, 0, 0, 11, 7.5, '#d98a50'); ellipse(g, 2, 3, 7, 4, '#fff0dc');
  const step = moving ? Math.sin(t * 22) * 2.5 : 0;
  g.fillStyle = '#4b3025'; g.fillRect(-7 + step, 5, 3, 5); g.fillRect(5 - step, 5, 3, 5);
  circle(g, 10, -6, 7.8, '#d98a50');
  g.fillStyle = '#d98a50'; g.beginPath(); g.moveTo(5, -10); g.lineTo(6, -21); g.lineTo(11, -12); g.fill(); g.beginPath(); g.moveTo(11, -12); g.lineTo(16, -20); g.lineTo(16, -9); g.fill();
  g.fillStyle = '#3a2a24'; g.beginPath(); g.moveTo(6.5, -12); g.lineTo(6.8, -18); g.lineTo(9.5, -12.5); g.fill();
  ellipse(g, 15, -4, 4.8, 3.2, '#fff4e0'); circle(g, 19.4, -5, 1.8, '#2a1f1b');
  if ((t * .9) % 4 < .12) { g.fillStyle = '#2a1f1b'; g.fillRect(10, -8, 3.4, 1.1); } else { circle(g, 11.5, -7.5, 1.7, '#2a1f1b'); circle(g, 11, -8.1, .6, '#ffffff'); }
  g.restore();
}

/** Fenn: a grey wolf with a green scarf, standing, facing right. */
export function paintWolf(g: CanvasRenderingContext2D, t: number, face: 1 | -1, moving = false) {
  const r = 18, run = moving ? Math.sin(t * 12) : Math.sin(t * 3) * .15, fur = '#8a8a96', dark = '#5a5a66';
  g.save(); g.scale(face, 1); g.translate(0, -Math.abs(run) * 2);
  g.strokeStyle = dark; g.lineWidth = 5; g.lineCap = 'round';
  for (const [lx, ph] of [[-.6, 1], [-.3, -1], [.35, -1], [.62, 1]] as Array<[number, number]>) { g.beginPath(); g.moveTo(lx * r, r * .2); g.lineTo(lx * r + run * ph * 6, r * .74); g.stroke(); }
  g.strokeStyle = fur; g.lineWidth = 7; g.beginPath(); g.moveTo(-r * .9, -r * .1); g.quadraticCurveTo(-r * 1.4, -r * .6 + Math.sin(t * 9) * 4, -r * 1.55, -r * .25); g.stroke();
  ellipse(g, 0, 0, r, r * .52, fur); ellipse(g, r * .1, r * .18, r * .6, r * .22, '#d8d8e0');
  ellipse(g, r * .85, -r * .32, r * .42, r * .34, fur);
  g.fillStyle = fur; g.beginPath(); g.moveTo(r * 1.05, -r * .38); g.lineTo(r * 1.5, -r * .2); g.lineTo(r * 1.05, -r * .1); g.fill();
  for (const ex of [.62, .92]) { g.beginPath(); g.moveTo(r * ex - 5, -r * .55); g.lineTo(r * ex, -r * .98); g.lineTo(r * ex + 5, -r * .55); g.fill(); }
  circle(g, r * 1.47, -r * .22, 2, '#2a2a30'); circle(g, r * 1.02, -r * .42, 2.3, '#2a2a30'); circle(g, r * .98, -r * .47, .8, '#ffffff');
  g.fillStyle = '#4f8a3a'; g.beginPath(); g.moveTo(r * .5, -r * .5); g.lineTo(r * .7, r * .05); g.lineTo(r * .45, r * .05); g.closePath(); g.fill(); g.beginPath(); g.moveTo(r * .55, -r * .2); g.lineTo(r * .15, r * .4); g.lineTo(r * .4, r * .45); g.closePath(); g.fill();
  g.restore();
  void TAU;
}
