'use client';
import { useEffect, useRef } from 'react';

export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    const colors = ['#fbbf24', '#f87171', '#34d399', '#60a5fa', '#f472b6'];
    const parts = Array.from({ length: 160 }, () => ({
      x: Math.random() * c.width,
      y: -20 - Math.random() * c.height * 0.5,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 4,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      w: 6 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    const start = performance.now();
    let raf = 0;
    const frame = (t: number) => {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.04;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2);
        ctx.restore();
      }
      if (t - start < 4500) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, c.width, c.height);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-50" aria-hidden />;
}
