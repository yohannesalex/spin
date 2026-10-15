'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ActionButton, JsonBlock } from '@/components/admin';
import { Spinner, StatusBadge } from '@/components/ui';
import { birr, dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

interface Detail {
  id: string; provider: string; claimedAmountCents: number; creditedCents: number | null; reference: string | null; referenceInput: string | null;
  imageKey: string | null; rawReceiptKey: string | null; parsedJson: Record<string, any> | null; status: string; flagLabels: string[]; attempts: number;
  reviewedBy: string | null; reviewNote: string | null; createdAt: string;
  user: { id: string; fullName: string; phone: string; status: string };
  flags: { id: string; severity: string; reason: string; status: string; createdAt: string; resolutionNote: string | null }[];
  sameReference: { id: string; status: string; user: { fullName: string } }[];
}

/** Image, decoded reference, fetched receipt, parsed fields and failed checks side by side. */
export default function DepositDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, reload } = useApi<Detail>(`/admin/deposits/${id}`);
  if (!data) return <Spinner />;
  const p = data.parsedJson ?? {};
  const rows: [string, React.ReactNode, React.ReactNode][] = [
    ['Amount', birr(data.claimedAmountCents), p.amountCents != null ? birr(p.amountCents) : '—'],
    ['Payer name', data.user.fullName, p.payerName ?? '—'],
    ['Payer account', data.user.phone, p.payerAccount ?? '—'],
    ['Receiver', 'Platform account', `${p.receiverName ?? '—'} · ${p.receiverAccount ?? '—'}`],
    ['Date', dateTime(data.createdAt) + ' (submitted)', p.date ? dateTime(p.date) : '—'],
    ['Status', '—', p.status ?? '—'],
    ['Reference', data.referenceInput ?? '(from image)', p.reference ?? data.reference ?? '—'],
  ];
  const done = () => reload();
  const closed = data.status === 'CREDITED';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/deposits" className="text-sm text-gray-400">← Deposits</Link>
        <h1 className="text-2xl font-bold">{birr(data.claimedAmountCents)} · {data.provider}</h1>
        <StatusBadge status={data.status} />
      </div>
      <div className="text-sm text-gray-400">
        <Link href={`/admin/users/${data.user.id}`} className="underline">{data.user.fullName}</Link> · {data.user.phone} · <StatusBadge status={data.user.status} /> · attempts {data.attempts}
      </div>
      {data.flagLabels.length > 0 && <div className="rounded-xl border border-amber-700 bg-amber-950/50 p-3 text-amber-200">Failed checks: <b>{data.flagLabels.join(', ')}</b></div>}
      {data.sameReference.length > 0 && (
        <div className="rounded-xl border border-red-700 bg-red-950/50 p-3 text-sm text-red-200">
          Same reference used by: {data.sameReference.map((s) => <Link key={s.id} href={`/admin/deposits/${s.id}`} className="mr-2 underline">{s.user.fullName} ({s.status})</Link>)}
        </div>
      )}

      {!closed && (
        <div className="flex flex-wrap gap-2">
          <ActionButton label="Approve & credit" className="btn-primary btn-sm" path={`/admin/deposits/${id}/approve`} extra={[{ name: 'amount', label: 'Corrected amount in birr (optional — leave empty to credit the claimed amount)', type: 'number' }]} transform={(v) => ({ reason: v.reason, ...(v.amount ? { amount: Number(v.amount) } : {}) })} onDone={done} />
          {data.status !== 'REJECTED' && <ActionButton label="Reject" className="btn-danger btn-sm" path={`/admin/deposits/${id}/reject`} onDone={done} />}
          <ActionButton label="Re-run verification" path={`/admin/deposits/${id}/rerun`} onDone={done} />
          <ActionButton label="Ask user for info" path={`/admin/deposits/${id}/ask-info`} extra={[{ name: 'message', label: 'Message to the user (in-app)', type: 'textarea', required: true }]} onDone={done} />
          <ActionButton label="Suspend user" className="btn-danger btn-sm" path={`/admin/deposits/${id}/suspend-user`} onDone={done} />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="card">
          <h2 className="mb-2 font-semibold">Uploaded image</h2>
          {data.imageKey ? (
            <a href={`/api/admin/deposits/${id}/image`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/admin/deposits/${id}/image`} alt="Receipt upload" className="max-h-[520px] w-full rounded-lg object-contain" />
            </a>
          ) : (
            <p className="text-sm text-gray-500">No image — reference pasted: <code>{data.referenceInput}</code></p>
          )}
          <p className="mt-2 text-xs text-gray-500">The image is only used to find the reference; the official receipt is the source of truth.</p>
        </div>
        <div className="card xl:col-span-2">
          <h2 className="mb-2 font-semibold">Claimed vs official receipt</h2>
          <table className="table">
            <thead><tr><th>Field</th><th>User / account</th><th>Official receipt</th></tr></thead>
            <tbody>{rows.map(([k, a, b]) => <tr key={k}><td className="text-gray-400">{k}</td><td>{a}</td><td>{b}</td></tr>)}</tbody>
          </table>
          {p.match && <p className="mt-2 text-xs text-gray-400">Sender name score: {p.match.senderScore} · matched receiving account: {p.match.receiverMatched ?? 'none'}</p>}
          {data.rawReceiptKey && <a className="btn-secondary btn-sm mt-3" href={`/api/admin/deposits/${id}/raw`} target="_blank" rel="noreferrer">Open fetched official receipt</a>}
          <details className="mt-3"><summary className="cursor-pointer text-sm text-gray-400">Parsed JSON</summary><JsonBlock value={data.parsedJson} /></details>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-2 font-semibold">Flags</h2>
        <table className="table">
          <thead><tr><th>When</th><th>Severity</th><th>Reason</th><th>Status</th><th>Resolution</th></tr></thead>
          <tbody>{data.flags.map((f) => <tr key={f.id}><td>{dateTime(f.createdAt)}</td><td><StatusBadge status={f.severity} /></td><td>{f.reason}</td><td><StatusBadge status={f.status} /></td><td className="text-gray-400">{f.resolutionNote}</td></tr>)}</tbody>
        </table>
        {data.reviewNote && <p className="mt-2 text-sm text-gray-400">Review note: {data.reviewNote}</p>}
      </div>
    </div>
  );
}
