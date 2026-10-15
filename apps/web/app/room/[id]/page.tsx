'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Confetti } from '@/components/Confetti';
import { Alert, Modal, Spinner as Loading } from '@/components/ui';
import { Spinner } from '@/components/Wheel';
import { api, ApiError, newIdempotencyKey } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { birr, timeLeft } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { serverText } from '@/lib/locale';
import { getSocket, noteServerTime, serverNow } from '@/lib/socket';

interface GameView {
  id: string;
  stakeCents: number;
  capacity: number;
  minPlayers: number;
  commissionBps: number;
  players: number;
  prizeIfFullCents: number;
  deadlineAt: string | null;
  status: 'OPEN' | 'DRAWING' | 'SETTLED' | 'CANCELLED';
  seedHash: string;
  serverTime: number;
  takenNumbers: number[];
  myNumber: number | null;
  cancelReason: string | null;
  result: null | {
    winningNumber: number;
    potCents: number;
    prizeCents: number;
    spinStartAt: string;
    spinDurationMs: number;
  };
}

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduce(mq.matches);
    const on = () => setReduce(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduce;
}

export default function Room() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const { user } = useAuth();
  const [game, setGame] = useState<GameView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [joinError, setJoinError] = useState<{ msg: string; code?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [spinDone, setSpinDone] = useState(false);
  const idemKey = useRef(newIdempotencyKey());
  const reduceMotion = usePrefersReducedMotion();
  useNow(250);

  const isPlayer = user?.role === 'PLAYER';
  const myNumberRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const g = await api<GameView>(`/games/${id}`);
      noteServerTime(g.serverTime);
      myNumberRef.current = g.myNumber;
      setGame(g);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  const loadBalance = useCallback(() => {
    if (isPlayer) api<{ balanceCents: number }>('/wallet').then((w) => setBalance(w.balanceCents)).catch(() => {});
  }, [isPlayer]);

  useEffect(() => {
    load();
  }, [load, user]);
  useEffect(loadBalance, [loadBalance]);
  useEffect(() => {
    try {
      setMuted(localStorage.getItem('sd_muted') === '1');
    } catch {}
  }, []);

  useEffect(() => {
    const s = getSocket();
    const subscribe = () => s.emit('game:subscribe', { gameId: id });
    const onConnect = () => {
      subscribe();
      load(); // catch up on anything missed while disconnected (REQ-ANIM-06)
    };
    const onTaken = (e: { gameId: string; number: number; players: number }) => {
      if (e.gameId !== id) return;
      setGame((g) => (g && !g.takenNumbers.includes(e.number) ? { ...g, takenNumbers: [...g.takenNumbers, e.number].sort((a, b) => a - b), players: e.players } : g));
    };
    const onResult = (g: GameView) => {
      if (g.id !== id) return;
      setGame({ ...g, myNumber: myNumberRef.current });
      setTimeout(loadBalance, (g.result?.spinDurationMs ?? 0) + 6000);
    };
    const onCancelled = (e: { gameId: string }) => {
      if (e.gameId === id) {
        load();
        loadBalance();
      }
    };
    subscribe();
    s.on('connect', onConnect);
    s.on('game:number_taken', onTaken);
    s.on('game:result', onResult);
    s.on('game:cancelled', onCancelled);
    return () => {
      s.off('connect', onConnect);
      s.off('game:number_taken', onTaken);
      s.off('game:result', onResult);
      s.off('game:cancelled', onCancelled);
    };
  }, [id, load, loadBalance]);

  const taken = useMemo(() => new Set(game?.takenNumbers ?? []), [game?.takenNumbers]);

  if (error) return <main className="mx-auto max-w-3xl px-4 py-6"><Alert>{error}</Alert></main>;
  if (!game) return <Loading />;

  const spinStart = game.result ? new Date(game.result.spinStartAt).getTime() : 0;
  const now = serverNow();
  const phase: 'open' | 'countdown' | 'spinning' | 'done' | 'cancelled' =
    game.status === 'CANCELLED'
      ? 'cancelled'
      : !game.result
        ? 'open'
        : now < spinStart
          ? 'countdown'
          : now < spinStart + game.result.spinDurationMs && !spinDone
            ? 'spinning'
            : 'done';
  const youWon = !!game.result && game.myNumber === game.result.winningNumber;
  const canAfford = balance == null || balance >= game.stakeCents;
  const deadlineLeft = game.deadlineAt ? new Date(game.deadlineAt).getTime() - now : null;

  const join = async () => {
    if (picked == null) return;
    setBusy(true);
    setJoinError(null);
    try {
      await api(`/games/${id}/join`, { body: { number: picked }, idempotencyKey: idemKey.current });
      myNumberRef.current = picked;
      setGame((g) => (g ? { ...g, myNumber: picked, takenNumbers: [...new Set([...g.takenNumbers, picked])].sort((a, b) => a - b) } : g));
      setPicked(null);
      loadBalance();
    } catch (e) {
      const err = e as ApiError;
      setJoinError({ msg: err.code === 'NUMBER_TAKEN' ? t('room.numberTaken') : err.message, code: err.code });
      if (err.code === 'NUMBER_TAKEN') load();
    } finally {
      idemKey.current = newIdempotencyKey();
      setBusy(false);
    }
  };

  const toggleMute = () => {
    setMuted((m) => {
      try {
        localStorage.setItem('sd_muted', m ? '0' : '1');
      } catch {}
      return !m;
    });
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      {phase === 'done' && youWon && <Confetti />}

      <div className="mb-4 grid grid-cols-3 gap-2 text-center sm:gap-3">
        <div className="card p-3">
          <div className="text-xs text-slate-500">{t('room.stake')}</div>
          <div className="font-bold">{birr(game.stakeCents)}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-slate-500">{t('room.players')}</div>
          <div className="font-bold">{game.players} / {game.capacity}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-slate-500">{t('room.prizeIfFull')}</div>
          <div className="font-bold text-gold-700">{birr(game.prizeIfFullCents)}</div>
        </div>
      </div>

      {phase === 'cancelled' && (
        <div className="card space-y-3 text-center">
          <p>{t('room.cancelled')}</p>
          {game.cancelReason && <p className="text-sm text-slate-500">{serverText(game.cancelReason)}</p>}
          <Link href="/" className="btn-primary">{t('room.backToLobby')}</Link>
        </div>
      )}

      {phase === 'open' && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-slate-600">
              {game.myNumber ? (
                <>
                  {t('room.yourNumber')}: <b className="text-lg text-teal-700">{game.myNumber}</b> · {t('room.odds')}: 1 / {game.players}
                </>
              ) : (
                t('room.pick')
              )}
            </span>
            <span className="tabular-nums text-slate-600">
              {deadlineLeft != null ? `${t('room.timeLeft')}: ${timeLeft(deadlineLeft)}` : t('room.noDeadline')}
            </span>
          </div>

          {!user && (
            <Alert kind="info">
              <Link href={`/login?next=/room/${id}`} className="underline">{t('room.loginToPlay')}</Link>
            </Alert>
          )}
          {isPlayer && !game.myNumber && !canAfford && (
            <Alert kind="warn">
              {t('room.lowBalance')}{' '}
              <Link href="/deposit" className="font-semibold underline">{t('room.depositNow')}</Link>
            </Alert>
          )}

          <div className="card mx-auto mt-3 grid max-w-xl grid-cols-10 gap-1 p-2 sm:gap-1.5 sm:p-3">
            {Array.from({ length: 100 }, (_, i) => i + 1).map((n) => {
              const mine = n === game.myNumber;
              const isTaken = taken.has(n) && !mine;
              const disabled = !isPlayer || !!game.myNumber || isTaken || !canAfford;
              return (
                <button
                  key={n}
                  disabled={disabled}
                  onClick={() => {
                    setJoinError(null);
                    setPicked(n);
                  }}
                  aria-label={`${n}${mine ? ` (${t('room.yourNumber')})` : isTaken ? ` (${t('room.taken')})` : ''}`}
                  className={`aspect-square rounded-md text-xs font-semibold tabular-nums transition sm:text-sm ${
                    mine
                      ? 'bg-teal-600 text-white ring-2 ring-teal-300'
                      : isTaken
                        ? 'bg-slate-100 text-slate-300 line-through'
                        : disabled
                          ? 'bg-slate-50 text-slate-400'
                          : 'border border-slate-200 bg-white text-slate-800 shadow-sm hover:border-gold-400 hover:bg-gold-400 active:scale-95'
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span><span className="mr-1 inline-block h-3 w-3 rounded border border-slate-300 bg-white align-middle" />{t('room.available')}</span>
            <span><span className="mr-1 inline-block h-3 w-3 rounded bg-slate-100 align-middle" />{t('room.taken')}</span>
            <span><span className="mr-1 inline-block h-3 w-3 rounded bg-teal-600 align-middle" />{t('room.yourNumber')}</span>
          </div>
          {game.myNumber && <p className="mt-4 text-center text-slate-600">{t('room.waiting')}</p>}
        </>
      )}

      {(phase === 'countdown' || phase === 'spinning' || phase === 'done') && game.result && (
        <div className="card relative">
          <div className="mb-2 flex justify-end">
            <button className="btn-secondary btn-sm" onClick={toggleMute}>{muted ? t('room.unmute') : t('room.mute')}</button>
          </div>
          {reduceMotion ? (
            // REQ-ANIM-07: short fade-to-result alternative.
            phase === 'done' ? null : <p className="py-16 text-center text-slate-600 transition-opacity">{t('room.startsIn')} {Math.max(0, Math.ceil((spinStart - now) / 1000))}s</p>
          ) : (
            <div className="relative">
              <Spinner
                gameId={game.id}
                numbers={game.takenNumbers}
                winningNumber={game.result.winningNumber}
                myNumber={game.myNumber}
                spinStartAt={spinStart}
                durationMs={game.result.spinDurationMs}
                muted={muted}
                onDone={() => setSpinDone(true)}
              />
              {phase === 'countdown' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-white/85 backdrop-blur-sm">
                  <div className="text-sm text-slate-700">{t('room.startsIn')}</div>
                  <div className="text-7xl font-black tabular-nums text-gold-700">{Math.max(1, Math.ceil((spinStart - now) / 1000))}</div>
                </div>
              )}
            </div>
          )}
          {phase === 'done' && (
            <div className="mt-4 space-y-3 text-center motion-safe:animate-[fadeIn_.4s_ease-out]">
              {youWon ? (
                <div className="text-2xl font-extrabold text-gold-700 sm:text-3xl">{t('room.youWon', { amount: birr(game.result.prizeCents) })}</div>
              ) : (
                <div className="text-2xl font-bold">{t('room.numberWon', { number: game.result.winningNumber })}</div>
              )}
              <div className="flex flex-wrap justify-center gap-2">
                <Link href={`/verify/${game.id}`} className="btn-secondary btn-sm">{t('room.verify')}</Link>
                <Link href="/" className="btn-primary btn-sm">{t('room.backToLobby')}</Link>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="mt-6 break-all text-xs text-slate-400">
        {t('room.fairness')} (SHA-256): {game.seedHash}
      </p>

      <Modal open={picked != null} onClose={() => setPicked(null)} title={t('room.pick')}>
        <p className="mb-4 text-lg">{t('room.confirm', { stake: birr(game.stakeCents), number: picked ?? '' })}</p>
        {joinError && (
          <div className="mb-3">
            <Alert>
              {joinError.msg}{' '}
              {joinError.code === 'INSUFFICIENT_FUNDS' && <Link href="/deposit" className="font-semibold underline">{t('room.depositNow')}</Link>}
            </Alert>
          </div>
        )}
        <div className="flex gap-2">
          <button className="btn-secondary flex-1" onClick={() => setPicked(null)}>{t('room.cancel')}</button>
          <button className="btn-primary flex-1" onClick={join} disabled={busy || joinError?.code === 'NUMBER_TAKEN'}>{t('room.confirmBtn')}</button>
        </div>
      </Modal>
    </main>
  );
}
