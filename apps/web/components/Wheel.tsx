'use client';
import { useEffect, useRef } from 'react';
import { serverNow } from '@/lib/socket';

/**
 * REQ-ANIM-01..06. The server sends the result and spinStartAt; every client derives the same
 * angle from (serverNow − spinStartAt), so all players see the same spin, and anyone who
 * (re)connects mid-spin jumps straight to the right frame.
 */
export interface SpinProps {
  gameId: string;
  numbers: number[]; // sorted
  winningNumber: number;
  myNumber: number | null;
  spinStartAt: number; // server ms
  durationMs: number;
  muted: boolean;
  onDone?: () => void;
}

const COLORS = ['#1f2a44', '#2b3a5c', '#22314f', '#33466d'];
const GOLD = '#fbbf24';

// Deterministic per-game jitter so the pointer doesn't always stop dead-centre (same for everyone).
function jitter(gameId: string): number {
  let h = 0;
  for (const c of gameId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ((h % 1000) / 1000 - 0.5) * 0.5; // −0.25 … +0.25 of a segment
}

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOutSine = (x: number) => -(Math.cos(Math.PI * x) - 1) / 2;

/** Progress in "segments travelled": fast start, ease-out, small overshoot, settle. */
export function spinPosition(elapsed: number, duration: number, finalPos: number, overshoot: number): number {
  const p = Math.min(Math.max(elapsed / duration, 0), 1);
  const split = 0.86;
  if (p < split) return (finalPos + overshoot) * easeOutCubic(p / split);
  return finalPos + overshoot - overshoot * easeInOutSine((p - split) / (1 - split));
}

function useTick(muted: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const last = useRef(0);
  useEffect(() => () => void ctxRef.current?.close().catch(() => {}), []);
  return () => {
    if (muted) return;
    const now = performance.now();
    if (now - last.current < 28) return; // the ear can't separate faster clicks
    last.current = now;
    try {
      ctxRef.current ??= new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = ctxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 1400;
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.03);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.035);
    } catch {
      /* audio unavailable */
    }
  };
}

function setupCanvas(canvas: HTMLCanvasElement, w: number, h: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export function Spinner(props: SpinProps) {
  return props.numbers.length > 40 ? <Reel {...props} /> : <WheelCanvas {...props} />;
}

function WheelCanvas({ gameId, numbers, winningNumber, myNumber, spinStartAt, durationMs, muted, onDone }: SpinProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const tick = useTick(muted);
  const tickRef = useRef(tick);
  tickRef.current = tick;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const canvas = ref.current!;
    const size = Math.min(canvas.parentElement!.clientWidth, 420);
    const ctx = setupCanvas(canvas, size, size);
    const n = numbers.length;
    const seg = (Math.PI * 2) / n;
    const w = numbers.indexOf(winningNumber);
    const rotations = 6;
    // Segments travelled clockwise until the winner's centre (+ jitter) sits under the top pointer.
    const finalPos = rotations * n + (n - (w + 0.5 + jitter(gameId))) % n;
    const overshoot = 0.2;
    const r = size / 2 - 10;
    const cx = size / 2;
    const cy = size / 2;
    let raf = 0;
    let lastSeg = -1;
    let finished = false;

    const draw = (pos: number, glow: boolean) => {
      const rot = pos * seg;
      ctx.clearRect(0, 0, size, size);
      for (let i = 0; i < n; i++) {
        const a0 = -Math.PI / 2 + i * seg + rot;
        const a1 = a0 + seg;
        const isWin = glow && numbers[i] === winningNumber;
        const isMine = numbers[i] === myNumber;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, a0, a1);
        ctx.closePath();
        ctx.fillStyle = isWin ? GOLD : isMine ? '#0f766e' : COLORS[i % COLORS.length];
        ctx.fill();
        ctx.strokeStyle = '#0b0f17';
        ctx.lineWidth = 2;
        ctx.stroke();
        // label
        const mid = a0 + seg / 2;
        ctx.save();
        ctx.translate(cx + Math.cos(mid) * r * 0.72, cy + Math.sin(mid) * r * 0.72);
        ctx.rotate(mid + Math.PI / 2);
        ctx.fillStyle = isWin ? '#0b0f17' : '#f3f4f6';
        ctx.font = `bold ${Math.max(11, Math.min(26, (r * seg) / 2.4))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(numbers[i]), 0, 0);
        ctx.restore();
      }
      // rim + hub
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = glow ? 6 : 4;
      if (glow) {
        ctx.shadowColor = GOLD;
        ctx.shadowBlur = 24;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = '#0b0f17';
      ctx.fill();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 3;
      ctx.stroke();
      // pointer
      ctx.beginPath();
      ctx.moveTo(cx - 14, 2);
      ctx.lineTo(cx + 14, 2);
      ctx.lineTo(cx, 30);
      ctx.closePath();
      ctx.fillStyle = '#f87171';
      ctx.fill();
    };

    const frame = () => {
      const elapsed = serverNow() - spinStartAt;
      if (elapsed >= durationMs) {
        draw(finalPos, true);
        if (!finished) {
          finished = true;
          doneRef.current?.();
        }
        return;
      }
      const pos = elapsed <= 0 ? 0 : spinPosition(elapsed, durationMs, finalPos, overshoot);
      const s = Math.floor(pos);
      if (lastSeg !== -1 && s !== lastSeg) tickRef.current();
      lastSeg = s;
      draw(pos, false);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [gameId, numbers, winningNumber, myNumber, spinStartAt, durationMs]);

  return <canvas ref={ref} className="mx-auto block" aria-label="Spinning wheel" role="img" />;
}

/** Vertical number reel for rooms with more than 40 entries, so labels stay readable. */
function Reel({ gameId, numbers, winningNumber, myNumber, spinStartAt, durationMs, muted, onDone }: SpinProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const tick = useTick(muted);
  const tickRef = useRef(tick);
  tickRef.current = tick;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const canvas = ref.current!;
    const width = Math.min(canvas.parentElement!.clientWidth, 360);
    const itemH = 64;
    const height = itemH * 5;
    const ctx = setupCanvas(canvas, width, height);
    const n = numbers.length;
    const w = numbers.indexOf(winningNumber);
    const finalPos = 3 * n + w + jitter(gameId) * 0.6;
    let raf = 0;
    let lastItem = -1;
    let finished = false;

    const draw = (pos: number, glow: boolean) => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, 0, width, height);
      const centreY = height / 2;
      const first = Math.floor(pos) - 3;
      for (let k = first; k <= first + 7; k++) {
        const num = numbers[((k % n) + n) % n];
        const y = centreY + (k - pos) * itemH;
        const dist = Math.abs(y - centreY) / (height / 2);
        const isWin = glow && num === winningNumber && Math.abs(k - pos) < 0.5;
        ctx.globalAlpha = Math.max(0.15, 1 - dist * 0.8);
        ctx.fillStyle = isWin ? GOLD : num === myNumber ? '#5eead4' : '#f3f4f6';
        ctx.font = `bold ${isWin ? 44 : 36}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(num), width / 2, y);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = glow ? 4 : 2;
      ctx.strokeRect(8, centreY - itemH / 2, width - 16, itemH);
      ctx.fillStyle = '#f87171';
      ctx.beginPath();
      ctx.moveTo(0, centreY - 10);
      ctx.lineTo(14, centreY);
      ctx.lineTo(0, centreY + 10);
      ctx.fill();
    };

    const frame = () => {
      const elapsed = serverNow() - spinStartAt;
      if (elapsed >= durationMs) {
        draw(finalPos, true);
        if (!finished) {
          finished = true;
          doneRef.current?.();
        }
        return;
      }
      const pos = elapsed <= 0 ? 0 : spinPosition(elapsed, durationMs, finalPos, 0.35);
      const item = Math.round(pos);
      if (lastItem !== -1 && item !== lastItem) tickRef.current();
      lastItem = item;
      draw(pos, false);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [gameId, numbers, winningNumber, myNumber, spinStartAt, durationMs]);

  return <canvas ref={ref} className="mx-auto block rounded-2xl" aria-label="Number reel" role="img" />;
}
