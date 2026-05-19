import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CircleNotch, CaretLeft, Trash, Plus, Copy, WarningCircle, ArrowsClockwise } from '@phosphor-icons/react';
import { api, type PublicUser } from './lib/api';

interface Props {
  currentUser: PublicUser;
  onBack: () => void;
  onLogout: () => void;
}

const AdminView: React.FC<Props> = ({ currentUser, onBack, onLogout }) => {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  // Create-user form
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');
  const [newPassword, setNewPassword] = useState('');
  const [createResult, setCreateResult] = useState<{ email: string; password: string } | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get<{ users: PublicUser[] }>('/api/users');
      setUsers(data.users);
    } catch (err: any) {
      setError(err?.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    setCreateResult(null);
    try {
      const data = await api.post<{ user: PublicUser; temp_password: string }>('/api/users', {
        email: newEmail.trim(),
        name: newName.trim() || undefined,
        role: newRole,
        password: newPassword.trim() || undefined,
      });
      setCreateResult({ email: data.user.email, password: data.temp_password });
      setUsers(prev => [data.user, ...prev]);
      setNewEmail('');
      setNewName('');
      setNewRole('user');
      setNewPassword('');
    } catch (err: any) {
      setError(err?.message || 'Failed to create user.');
    } finally {
      setCreating(false);
    }
  };

  const handleResetPassword = async (user: PublicUser) => {
    const newPwd = prompt(`Reset password for ${user.email} — enter a new temporary password (≥ 8 chars), or leave blank to auto-generate:`, '');
    if (newPwd === null) return;
    try {
      const data = await api.patch<{ user: PublicUser; reset_password?: string }>(`/api/users/${user.id}`, {
        new_password: newPwd.trim() || `tmp-${Math.random().toString(36).slice(2, 10)}`,
      });
      const pwd = data.reset_password!;
      alert(`Password reset for ${user.email}\n\nTemporary password: ${pwd}\n\nThey must change it on next sign-in. Share securely.`);
      refresh();
    } catch (err: any) {
      setError(err?.message || 'Reset failed.');
    }
  };

  const handleDelete = async (user: PublicUser) => {
    if (user.id === currentUser.id) { alert('You cannot delete yourself.'); return; }
    if (!confirm(`Delete user ${user.email}? Their renders will also be removed. This cannot be undone.`)) return;
    try {
      await api.delete(`/api/users/${user.id}`);
      setUsers(prev => prev.filter(u => u.id !== user.id));
    } catch (err: any) {
      setError(err?.message || 'Delete failed.');
    }
  };

  const handleToggleRole = async (user: PublicUser) => {
    const nextRole: 'admin' | 'user' = user.role === 'admin' ? 'user' : 'admin';
    if (user.id === currentUser.id && nextRole === 'user') {
      if (!confirm('Demote yourself to user? You will lose admin access immediately.')) return;
    }
    try {
      await api.patch(`/api/users/${user.id}`, { role: nextRole });
      refresh();
    } catch (err: any) {
      setError(err?.message || 'Role change failed.');
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-zinc-50 font-sans">
      <header className="border-b border-zinc-200 bg-white px-6 md:px-10 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-500 hover:text-zinc-950 transition-colors" title="Back to generator">
            <CaretLeft className="w-5 h-5" />
          </button>
          <div className="border-l border-zinc-300 pl-3 py-0.5">
            <h1 className="text-sm font-bold tracking-tight text-zinc-950 uppercase leading-none mb-1">User Management</h1>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-none">Admin · {currentUser.email}</p>
          </div>
        </div>
        <button onClick={onLogout} className="px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase text-zinc-500 hover:text-red-600 hover:bg-red-50 rounded transition-all">
          Sign Out
        </button>
      </header>

      <main className="px-6 md:px-10 py-8 max-w-5xl mx-auto flex flex-col gap-8">
        {error && (
          <div className="px-4 py-3 border border-red-200 bg-red-50 rounded-lg flex items-center gap-2">
            <WarningCircle weight="fill" className="w-4 h-4 text-red-600 shrink-0" />
            <span className="text-[13px] text-red-700">{error}</span>
          </div>
        )}

        {/* Create user */}
        <section className="bg-white border border-zinc-200 rounded-xl p-5">
          <h2 className="text-[11px] font-bold tracking-widest uppercase text-zinc-900 mb-4 flex items-center gap-2">
            <Plus weight="bold" className="w-3.5 h-3.5" /> Create user
          </h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div className="md:col-span-2 flex flex-col gap-1">
              <label className="text-[9px] font-bold tracking-widest text-zinc-500 uppercase">Email</label>
              <input type="email" required value={newEmail} onChange={e => setNewEmail(e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-md p-2 text-[13px]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold tracking-widest text-zinc-500 uppercase">Name (optional)</label>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-md p-2 text-[13px]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold tracking-widest text-zinc-500 uppercase">Role</label>
              <select value={newRole} onChange={e => setNewRole(e.target.value as 'admin' | 'user')} className="w-full bg-zinc-50 border border-zinc-200 rounded-md p-2 text-[13px]">
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold tracking-widest text-zinc-500 uppercase">Password (optional)</label>
              <input type="text" placeholder="auto-gen if blank" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-md p-2 text-[13px] font-mono" />
            </div>
            <div className="md:col-span-5 flex justify-end">
              <button type="submit" disabled={creating} className="px-4 py-2 bg-zinc-950 hover:bg-zinc-800 text-white text-[11px] font-bold uppercase tracking-wide rounded disabled:opacity-50 flex items-center gap-2">
                {creating && <CircleNotch className="w-3.5 h-3.5 animate-spin" />}
                Create user
              </button>
            </div>
          </form>

          {createResult && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-3 border border-emerald-200 bg-emerald-50 rounded-lg flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-emerald-900">User created — share this temporary password securely</p>
                <p className="text-[11px] text-emerald-800 mt-1 font-mono break-all"><span className="opacity-70">{createResult.email}</span> &middot; <span className="bg-white px-1.5 py-0.5 rounded border border-emerald-200">{createResult.password}</span></p>
                <p className="text-[10px] text-emerald-700 mt-1">They'll be required to change it on first sign-in.</p>
              </div>
              <button onClick={() => navigator.clipboard.writeText(createResult.password)} className="text-emerald-700 hover:text-emerald-900 p-1.5 rounded hover:bg-emerald-100" title="Copy password">
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setCreateResult(null)} className="text-emerald-700 hover:text-emerald-900 text-[11px] font-bold uppercase tracking-wide">Dismiss</button>
            </motion.div>
          )}
        </section>

        {/* User list */}
        <section className="bg-white border border-zinc-200 rounded-xl">
          <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between">
            <h2 className="text-[11px] font-bold tracking-widest uppercase text-zinc-900">All users</h2>
            <span className="text-[10px] font-mono text-zinc-400">{users.length} total</span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <CircleNotch weight="bold" className="w-6 h-6 text-zinc-400 animate-spin" />
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-[9px] font-bold tracking-widest uppercase text-zinc-500 border-b border-zinc-100">
                  <th className="text-left px-5 py-3">Email</th>
                  <th className="text-left px-5 py-3">Name</th>
                  <th className="text-left px-5 py-3">Role</th>
                  <th className="text-left px-5 py-3">Created</th>
                  <th className="text-right px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition-colors">
                    <td className="px-5 py-3 text-[12px] font-medium text-zinc-900">
                      {u.email}
                      {u.must_change_password ? <span className="ml-2 text-[9px] font-bold uppercase tracking-widest text-amber-700 bg-amber-100 px-1 py-0.5 rounded">pwd change pending</span> : null}
                    </td>
                    <td className="px-5 py-3 text-[12px] text-zinc-700">{u.name || <span className="text-zinc-400 italic">—</span>}</td>
                    <td className="px-5 py-3">
                      <button onClick={() => handleToggleRole(u)} className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${u.role === 'admin' ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-700'} hover:opacity-80`}>{u.role}</button>
                    </td>
                    <td className="px-5 py-3 text-[11px] font-mono text-zinc-500">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => handleResetPassword(u)} className="text-zinc-400 hover:text-zinc-900 p-1.5 rounded hover:bg-zinc-100" title="Reset password">
                          <ArrowsClockwise className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(u)} disabled={u.id === currentUser.id} className="text-zinc-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed" title={u.id === currentUser.id ? "You can't delete yourself" : 'Delete user'}>
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
};

export default AdminView;
