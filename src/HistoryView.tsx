import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CircleNotch, Trash, CaretLeft, DownloadSimple, WarningCircle } from '@phosphor-icons/react';
import { api, type PublicUser, type RenderHistoryItem } from './lib/api';

interface Props {
  currentUser: PublicUser;
  onBack: () => void;
  onLogout: () => void;
}

const variationBadge = (v: 'baseline' | 'tuned' | 'reimagined') =>
  v === 'baseline' ? 'bg-zinc-950 text-white' :
  v === 'tuned' ? 'bg-amber-500 text-white' : 'bg-purple-500 text-white';

const engineBadge = (e: 'openai' | 'gemini') =>
  e === 'openai' ? 'bg-emerald-500 text-white' : 'bg-blue-500 text-white';

const HistoryView: React.FC<Props> = ({ currentUser, onBack, onLogout }) => {
  const [items, setItems] = useState<RenderHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<RenderHistoryItem | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get<{ renders: RenderHistoryItem[]; total: number }>('/api/renders?limit=100');
      setItems(data.renders);
    } catch (err: any) {
      setError(err?.message || 'Failed to load history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this render permanently?')) return;
    try {
      await api.delete(`/api/renders/${id}`);
      setItems(prev => prev.filter(i => i.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch (err: any) {
      setError(err?.message || 'Delete failed.');
    }
  };

  const handleDownload = async (item: RenderHistoryItem) => {
    const res = await fetch(item.image_url, { credentials: 'include' });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.topic.slice(0, 40).replace(/[^a-z0-9]+/gi, '-')}-${item.variation}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-[100dvh] w-full bg-zinc-50 font-sans">
      <header className="border-b border-zinc-200 bg-white px-6 md:px-10 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-500 hover:text-zinc-950 transition-colors" title="Back to generator">
            <CaretLeft className="w-5 h-5" />
          </button>
          <div className="border-l border-zinc-300 pl-3 py-0.5">
            <h1 className="text-sm font-bold tracking-tight text-zinc-950 uppercase leading-none mb-1">My History</h1>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-none">{currentUser.email}</p>
          </div>
        </div>
        <button onClick={onLogout} className="px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase text-zinc-500 hover:text-red-600 hover:bg-red-50 rounded transition-all">
          Sign Out
        </button>
      </header>

      <main className="px-6 md:px-10 py-8 max-w-7xl mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <CircleNotch weight="bold" className="w-8 h-8 text-zinc-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="px-4 py-3 border border-red-200 bg-red-50 rounded-lg flex items-center gap-2">
            <WarningCircle weight="fill" className="w-4 h-4 text-red-600 shrink-0" />
            <span className="text-[13px] text-red-700">{error}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-24 text-zinc-500">
            <p className="text-lg font-medium text-zinc-600 mb-2">No renders yet</p>
            <p className="text-sm">Generate some variants from the main page — they'll show up here automatically.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map(item => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group"
              >
                <button onClick={() => setSelected(item)} className="w-full aspect-[4/3] bg-zinc-100 overflow-hidden relative">
                  <img src={item.image_url} alt={item.topic} loading="lazy" className="w-full h-full object-cover" />
                  <div className={`absolute top-2 left-2 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${variationBadge(item.variation)}`}>{item.variation}</div>
                  <div className={`absolute bottom-2 right-2 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${engineBadge(item.engine)}`}>{item.engine === 'openai' ? 'GPT' : 'GEM'}</div>
                </button>
                <div className="p-3 flex flex-col gap-2">
                  <p className="text-[11px] text-zinc-900 font-medium line-clamp-2 leading-snug" title={item.topic}>{item.topic}</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-mono text-zinc-400">{new Date(item.created_at).toLocaleDateString()} · {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleDownload(item)} className="text-zinc-400 hover:text-zinc-900 p-1 rounded hover:bg-zinc-100 transition-colors" title="Download PNG">
                        <DownloadSimple className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="text-zinc-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors" title="Delete">
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      {selected && (
        <div onClick={() => setSelected(null)} className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6 cursor-pointer">
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl overflow-hidden max-w-5xl w-full max-h-[90vh] flex flex-col cursor-default">
            <img src={selected.image_url} alt={selected.topic} className="w-full h-auto object-contain max-h-[75vh] bg-zinc-100" />
            <div className="p-4 flex items-center justify-between gap-4 border-t border-zinc-200 bg-white">
              <div className="flex flex-col gap-1 min-w-0">
                <p className="text-[13px] font-semibold text-zinc-900 truncate">{selected.topic}</p>
                <span className="text-[10px] font-mono text-zinc-500">{selected.variation} · {selected.engine} {selected.visual_rhetoric ? `· ${selected.visual_rhetoric}` : ''} · {new Date(selected.created_at).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => handleDownload(selected)} className="px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 text-white text-[11px] font-bold uppercase tracking-wide rounded">Download PNG</button>
                <button onClick={() => handleDelete(selected.id)} className="px-3 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 text-[11px] font-bold uppercase tracking-wide rounded">Delete</button>
                <button onClick={() => setSelected(null)} className="px-3 py-1.5 border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-[11px] font-bold uppercase tracking-wide rounded">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryView;
