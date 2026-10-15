'use client';
import { ActionButton } from '@/components/admin';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

export default function Admins() {
  const { user } = useAuth();
  const { data, reload } = useApi<any[]>('/admin/admins');
  if (!data) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin accounts</h1>
        <ActionButton label="Create admin" className="btn-primary btn-sm" path="/admin/admins" onDone={reload}
          extra={[
            { name: 'fullName', label: 'Full name', required: true },
            { name: 'phone', label: 'Phone (receives 2FA codes)', required: true, defaultValue: '+251 ' },
            { name: 'password', label: 'Temporary password', required: true, hint: 'At least 8 characters with a letter and a digit' },
          ]} />
      </div>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"><table className="table">
        <thead><tr><th>Name</th><th>Phone</th><th>Role</th><th>Status</th><th>Created</th><th /></tr></thead>
        <tbody>
          {data.map((a) => (
            <tr key={a.id}>
              <td>{a.fullName}{a.id === user?.id && <span className="ml-1 text-xs text-slate-500">(you)</span>}</td>
              <td>{a.phone}</td>
              <td>{a.role}</td>
              <td>{a.disabled ? <span className="text-red-600">disabled</span> : 'active'}</td>
              <td>{dateTime(a.createdAt)}</td>
              <td className="space-x-1 whitespace-nowrap">
                {a.id !== user?.id && (a.disabled
                  ? <ActionButton label="Enable" path={`/admin/admins/${a.id}/enable`} onDone={reload} />
                  : <ActionButton label="Disable" className="btn-danger btn-sm" path={`/admin/admins/${a.id}/disable`} onDone={reload} />)}
                <ActionButton label="Reset 2FA" path={`/admin/admins/${a.id}/reset-2fa`} onDone={reload} extra={[{ name: 'phone', label: 'New 2FA phone number', required: true, defaultValue: a.phone }]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
