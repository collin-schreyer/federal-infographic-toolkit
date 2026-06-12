import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CircleNotch, CaretLeft, Trash, Plus, FolderOpen, WarningCircle } from '@phosphor-icons/react';
import { api, type PublicUser, type Project } from './lib/api';

interface Props {
  currentUser: PublicUser;
  onBack: () => void;
  onLogout: () => void;
  // Open one project's gallery (HistoryView locked to that project).
  onOpenProject: (project: Project) => void;
  // Select this project in the generator and navigate there.
  onAddImages: (project: Project) => void;
}

const ProjectsView: React.FC<Props> = ({ currentUser, onBack, onLogout, onOpenProject, onAddImages }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get<{ projects: Project[] }>('/api/projects');
      setProjects(data.projects);
    } catch (err: any) {
      setError(err?.message || 'Failed to load projects.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleCreate = async () => {
    const name = window.prompt('Project name (e.g. the solicitation number or pursuit name):')?.trim();
    if (!name) return;
    try {
      const { project } = await api.post<{ project: Project }>('/api/projects', { name });
      setProjects(prev => [project, ...prev]);
    } catch (err: any) {
      setError(err?.message || 'Failed to create project.');
    }
  };

  const handleDelete = async (p: Project) => {
    if (!window.confirm(`Delete project "${p.name}"? Its ${p.render_count} image${p.render_count === 1 ? '' : 's'} are kept — they just move to Unfiled in your History.`)) return;
    try {
      await api.delete(`/api/projects/${p.id}`);
      setProjects(prev => prev.filter(x => x.id !== p.id));
    } catch (err: any) {
      setError(err?.message || 'Delete failed.');
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
            <h1 className="text-sm font-bold tracking-tight text-zinc-950 uppercase leading-none mb-1">Projects</h1>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-none">{currentUser.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCreate}
            className="px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 text-white text-[10px] font-bold tracking-widest uppercase rounded-lg transition-all flex items-center gap-1.5"
          >
            <Plus weight="bold" className="w-3 h-3" /> New Project
          </button>
          <button onClick={onLogout} className="px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase text-zinc-500 hover:text-red-600 hover:bg-red-50 rounded transition-all">
            Sign Out
          </button>
        </div>
      </header>

      <main className="px-6 md:px-10 py-8 max-w-5xl mx-auto">
        {error && (
          <div className="px-4 py-3 mb-6 border border-red-200 bg-red-50 rounded-lg flex items-center gap-2">
            <WarningCircle weight="fill" className="w-4 h-4 text-red-600 shrink-0" />
            <span className="text-[13px] text-red-700">{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <CircleNotch weight="bold" className="w-8 h-8 text-zinc-400 animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-24 text-zinc-500 max-w-md mx-auto">
            <FolderOpen weight="thin" className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
            <p className="text-lg font-medium text-zinc-600 mb-2">No projects yet</p>
            <p className="text-sm leading-relaxed">
              Projects are optional — you can always render images without one. But when you're working a specific solicitation, create a project and every image you generate files under it, so you can come back later and pick up where you left off.
            </p>
            <button
              onClick={handleCreate}
              className="mt-5 px-4 py-2 bg-zinc-950 hover:bg-zinc-800 text-white text-[11px] font-bold tracking-widest uppercase rounded-lg"
            >
              + Create your first project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {projects.map(p => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-zinc-200 rounded-xl shadow-sm hover:shadow-md transition-shadow flex items-center gap-4 p-4 cursor-pointer group"
                onClick={() => onOpenProject(p)}
              >
                <div className="w-11 h-11 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center justify-center shrink-0 group-hover:bg-zinc-950 group-hover:text-white text-zinc-500 transition-colors">
                  <FolderOpen weight="fill" className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold text-zinc-900 truncate">{p.name}</p>
                  <p className="text-[10px] font-mono text-zinc-500">
                    {p.render_count} image{p.render_count === 1 ? '' : 's'} · created {new Date(p.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); onAddImages(p); }}
                    className="px-2.5 py-1.5 bg-zinc-950 hover:bg-zinc-800 text-white text-[10px] font-bold uppercase tracking-wide rounded-md"
                    title="Open the generator with this project selected"
                  >
                    + Add
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(p); }}
                    className="text-zinc-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 transition-colors"
                    title="Delete project (images are kept as Unfiled)"
                  >
                    <Trash className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default ProjectsView;
