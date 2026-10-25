"use client";

/**
 * OWNER: Amaan. The "task done" moment: a confetti burst from both bottom corners plus a short
 * three-note chime. No libraries. Confetti is skipped when the user asks for reduced motion.
 */

const COLORS = ["#0b4a5e", "#1b2a35", "#b38615", "#8c5419", "#d9c08a"]; // palette: teal, navy, mustard, rust, light mustard

function chime() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const notes = [1046.5, 1318.5, 1568.0]; // C6, E6, G6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime + i * 0.09;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch {
    // no sound available; that's fine
  }
}

type Piece = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; w: number; h: number; color: string };

function confetti() {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  const W = window.innerWidth, H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: `${W}px`, height: `${H}px`, pointerEvents: "none", zIndex: "60" });
  document.body.appendChild(canvas);
  const g = canvas.getContext("2d");
  if (!g) { canvas.remove(); return; }
  g.scale(dpr, dpr);

  const pieces: Piece[] = [];
  for (const side of [0, 1]) {
    for (let i = 0; i < 70; i++) {
      const angle = (side === 0 ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.9;
      const speed = 11 + Math.random() * 9;
      pieces.push({
        x: side === 0 ? 0 : W, y: H,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      });
    }
  }

  const start = performance.now();
  const DURATION = 2600;
  function frame(now: number) {
    const t = now - start;
    g!.clearRect(0, 0, W, H);
    g!.globalAlpha = Math.max(0, 1 - Math.max(0, t - DURATION * 0.6) / (DURATION * 0.4));
    for (const p of pieces) {
      p.vy += 0.32;            // gravity
      p.vx *= 0.99;            // air
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      g!.save();
      g!.translate(p.x, p.y);
      g!.rotate(p.rot);
      g!.fillStyle = p.color;
      g!.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)) + 1); // flutter
      g!.restore();
    }
    if (t < DURATION) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}

export function celebrate() {
  chime();
  confetti();
}
