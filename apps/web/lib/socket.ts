'use client';
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
/** serverTime − clientTime, in ms. Used to sync the spin (REQ-ANIM-02). */
let clockOffset = 0;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000', { transports: ['websocket', 'polling'], withCredentials: true });
    socket.on('connect', syncClock);
  }
  return socket;
}

function syncClock() {
  // Take the best of a few round-trips.
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    socket?.emit('time', {}, (r: { serverTime: number }) => {
      const rtt = Date.now() - t0;
      if (rtt < best) {
        best = rtt;
        clockOffset = r.serverTime + rtt / 2 - Date.now();
      }
    });
  }
}

/** Fallback sync from REST responses that include serverTime. */
export function noteServerTime(serverTime: number) {
  if (!socket?.connected) clockOffset = serverTime - Date.now();
}

export const serverNow = () => Date.now() + clockOffset;
