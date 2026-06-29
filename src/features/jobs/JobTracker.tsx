import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Search, Calendar as CalendarIcon, LayoutGrid, Clock, Trash2, BarChart2, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DragDropContext } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import { toast } from 'sonner';
import { collection, query, where, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useGlobalData } from '../../contexts/GlobalDataContext'; // ✅ FIX: Use shared context

import type { JobApplication } from '../../types/index';
import { Column } from './Column';
import { JobModal } from './JobModal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { formatDisplayDate } from '../../utils/dateUtils';

const COLUMNS: { title: string; status: JobApplication['status'] }[] = [
  { title: 'Wishlist', status: 'wishlist' },
  { title: 'Applied', status: 'applied' },
  { title: 'Interviewing', status: 'interviewing' },
  { title: 'Offer', status: 'offer' },
  { title: 'Rejected', status: 'rejected' }
];

export const JobTracker = () => {
  const user = auth.currentUser;
  const navigate = useNavigate();
  // ✅ FIX: Use GlobalDataContext instead of creating duplicate Firestore listeners
  // GlobalDataContext already has onSnapshot listeners for job_applications and learning_topics.
  // The old code created 2nd copies of these listeners, causing double-reads on every change.
  const { jobs: globalJobs, learningTopics: globalLearningTopics } = useGlobalData();
  const [jobs, setJobs] = useState<JobApplication[]>([]);
  const [learningTopics, setLearningTopics] = useState<{id: string, title: string}[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingJob, setEditingJob] = useState<JobApplication | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string }>({ isOpen: false, id: '' });

  // Filters & Views
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobApplication['status'] | 'all'>('all');
  const [viewMode, setViewMode] = useState<'kanban' | 'timeline' | 'analytics'>('kanban');

  // ✅ FIX: Sync from GlobalDataContext instead of creating our own Firestore listeners
  useEffect(() => {
    setJobs(globalJobs as JobApplication[]);
    setIsLoading(false);
  }, [globalJobs]);

  useEffect(() => {
    setLearningTopics(globalLearningTopics.map((t: any) => ({ id: t.id, title: t.title })));
  }, [globalLearningTopics]);



  const handleSaveJob = async (jobData: Partial<JobApplication>) => {
    try {
      if (!user) return;
      const isEditing = !!jobData.id;

      if (isEditing) {
        await updateDoc(doc(db, 'job_applications', jobData.id as string), jobData as any);
        toast.success('Job updated successfully');
      } else {
        await addDoc(collection(db, 'job_applications'), { ...jobData, userId: user.uid });
        toast.success('Job added to board');
      }
      setIsModalOpen(false);
      setEditingJob(null);
    } catch (error: any) {
      console.error('Error saving job:', error);
      toast.error(error.message || 'Failed to save job');
    }
  };

  const handleQuickUpdate = useCallback(async (id: string, data: Partial<JobApplication>) => {
    try {
      await updateDoc(doc(db, 'job_applications', id), data as any);
      if (data.followUpDate !== undefined) {
        toast.success(data.followUpDate ? 'Follow-up reminder set' : 'Follow-up reminder removed');
      }
    } catch (error: any) {
      console.error('Error quick updating job:', error);
      toast.error('Failed to update job');
    }
  }, []);

  const handleDeleteJob = useCallback((id: string) => {
    setDeleteConfirm({ isOpen: true, id });
  }, []);

  const handleEditJob = useCallback((job: JobApplication) => {
    setEditingJob(job);
    setIsModalOpen(true);
  }, []);

  const confirmDeleteJob = async () => {
    try {
      await deleteDoc(doc(db, 'job_applications', deleteConfirm.id));
      toast.success('Job deleted');
      setDeleteConfirm({ isOpen: false, id: '' });
    } catch (error: any) {
      console.error('Error deleting job:', error);
      toast.error(error.message || 'Failed to delete job');
    }
  };

  const onDragEnd = useCallback(async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStatus = destination.droppableId as JobApplication['status'];
    let movedJob: JobApplication | undefined;

    setJobs(prevJobs => {
      const updatedJobs = Array.from(prevJobs);
      const index = updatedJobs.findIndex(j => j.id === draggableId);
      if (index === -1) return prevJobs;
      movedJob = updatedJobs[index];
      updatedJobs[index] = { ...movedJob, status: newStatus };
      return updatedJobs;
    });

    if (!movedJob) return;

    try {
      const jobRef = doc(db, 'job_applications', draggableId);
      await updateDoc(jobRef, { status: newStatus });
      toast.success(`Moved to ${newStatus.replace('-', ' ')}`);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Failed to move job');
      setJobs(prevJobs => {
        const updatedJobs = Array.from(prevJobs);
        const index = updatedJobs.findIndex(j => j.id === draggableId);
        if (index === -1) return prevJobs;
        updatedJobs[index] = { ...movedJob!, status: movedJob!.status };
        return updatedJobs;
      });
    }
  }, []);

  const filteredJobs = useMemo(() => {
    return jobs.filter(j => {
      const matchesSearch = j.company.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            j.role.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || j.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [jobs, searchQuery, statusFilter]);

  const salaryData = useMemo(() => {
    return jobs
      .filter(j => j.expectedSalary || j.offeredSalary)
      .map(j => {
        const parseSal = (s?: string) => {
          if (!s) return 0;
          // Extract digits and decimals
          const match = s.match(/[\d.]+/g);
          if (!match) return 0;
          let num = parseFloat(match.join(''));
          if (isNaN(num)) return 0;
          
          // If the string contains "LPA" or "lpa", it's already in LPA
          if (s.toLowerCase().includes('lpa')) return num;
          
          // If the number is large (e.g. 1200000), convert it to LPA
          if (num > 1000) {
            num = num / 100000;
          }
          // Cap at 2 decimal places
          return Math.round(num * 100) / 100;
        };
        return {
          name: j.company,
          Expected: parseSal(j.expectedSalary),
          Offered: parseSal(j.offeredSalary)
        };
      })
      .filter(d => d.Expected > 0 || d.Offered > 0);
  }, [jobs]);

  const topicTitleMap = useMemo(() => {
    return learningTopics.reduce((acc, t) => {
      acc[t.id] = t.title;
      return acc;
    }, {} as Record<string, string>);
  }, [learningTopics]);

  // Statistics
  const stats = useMemo(() => ({
    totalApplied: jobs.filter(j => j.status !== 'wishlist').length,
    interviewingCount: jobs.filter(j => j.status === 'interviewing').length,
    offersCount: jobs.filter(j => j.status === 'offer').length
  }), [jobs]);
  const { totalApplied, interviewingCount, offersCount } = stats;

  const kanbanBoard = useMemo(() => (
    <DragDropContext onDragEnd={onDragEnd}>
      <main className="board" style={{ flex: 1, height: 'auto', padding: 0 }}>
        {COLUMNS.map(col => {
          if (statusFilter !== 'all' && statusFilter !== col.status) return null;
          return (
            <Column 
              key={col.status}
              title={col.title}
              status={col.status}
              isLoading={isLoading}
              jobs={filteredJobs.filter(j => j.status === col.status)}
              onEditJob={handleEditJob}
              onDeleteJob={handleDeleteJob}
              onQuickUpdate={handleQuickUpdate}
              topicTitleMap={topicTitleMap}
            />
          )
        })}
      </main>
    </DragDropContext>
  ), [filteredJobs, isLoading, statusFilter, topicTitleMap, handleEditJob, handleDeleteJob, handleQuickUpdate, onDragEnd]);

  return (
    <div className="page-pad" style={{ display: 'flex', flexDirection: 'column' }}>
      
      {/* Header and Stats */}
      <div className="page-header" style={{ alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div className="page-header-info">
          <h1>Job Tracker</h1>
          <p className="subtitle" style={{ display: 'flex', gap: '1rem' }}>
            <span><strong style={{color: 'var(--text-primary)'}}>{totalApplied}</strong> Applied</span>
            <span><strong style={{color: '#fbbf24'}}>{interviewingCount}</strong> Interviewing</span>
            <span><strong style={{color: '#4ade80'}}>{offersCount}</strong> Offers</span>
          </p>
        </div>

        <div className="page-header-actions" style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn-secondary" onClick={() => navigate('/tools')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(96, 165, 250, 0.1))', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
            <Sparkles size={16} /> AI Job Analyzer
          </button>
          <button className="btn-primary" onClick={() => { setEditingJob(null); setIsModalOpen(true); }}>
            <Plus size={16} strokeWidth={2.5} /> New Job
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-input-wrap" style={{ flex: '1 1 200px' }}>
          <Search size={16} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search companies, roles..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <span className="filter-divider" />
        
        <span className="filter-label">Status</span>
        <select 
          className="filter-select"
          value={statusFilter} 
          onChange={e => setStatusFilter(e.target.value as any)}
        >
          <option value="all">All Status</option>
          {COLUMNS.map(c => (
            <option key={c.status} value={c.status}>{c.title}</option>
          ))}
        </select>

        <span className="filter-divider" />
        
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button 
            className={`btn-secondary btn-sm ${viewMode === 'kanban' ? 'active' : ''}`}
            onClick={() => setViewMode('kanban')}
            title="Kanban View"
          >
            <LayoutGrid size={16} /> Kanban
          </button>
          <button 
            className={`btn-secondary btn-sm ${viewMode === 'timeline' ? 'active' : ''}`}
            onClick={() => setViewMode('timeline')}
            title="Timeline View"
          >
            <CalendarIcon size={16} /> Timeline
          </button>
          <button 
            className={`btn-secondary btn-sm ${viewMode === 'analytics' ? 'active' : ''}`}
            onClick={() => setViewMode('analytics')}
            title="Salary Analytics"
          >
            <BarChart2 size={16} /> Analytics
          </button>
        </div>
      </div>

      {viewMode === 'kanban' ? kanbanBoard : viewMode === 'timeline' ? (
        <div style={{ flex: 1, background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr', gap: '1rem', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <div>Date</div>
            <div>Company & Role</div>
            <div>Status</div>
            <div>Interview Date</div>
            <div>Action</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {[...filteredJobs].sort((a, b) => new Date(b.dateApplied).getTime() - new Date(a.dateApplied).getTime()).map(job => (
              <div key={job.id} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr', gap: '1rem', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', alignItems: 'center', fontSize: '0.9rem' }}>
                <div style={{ color: 'var(--text-muted)' }}>{formatDisplayDate(job.dateApplied)}</div>
                <div>
                  <div style={{ fontWeight: 500 }}>{job.company}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{job.role}</div>
                </div>
                <div><span className={`tag ${job.status}`}>{job.status.replace('-', ' ')}</span></div>
                <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {job.status === 'interviewing' && job.interviewDate ? (
                    <>
                      <Clock size={14} color="#fbbf24" />
                      {formatDisplayDate(job.interviewDate)}
                    </>
                  ) : '-'}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={() => { setEditingJob(job); setIsModalOpen(true); }}>Edit</button>
                  <button className="btn-icon danger" onClick={() => handleDeleteJob(job.id!)} title="Delete"><Trash2 size={16}/></button>
                </div>
              </div>
            ))}
            {filteredJobs.length === 0 && (
              <div className="empty-state" style={{ margin: '2rem', border: 'none' }}>No applications found.</div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', padding: '2rem', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem', fontWeight: 600 }}>Salary Analytics</h2>
          {salaryData.length === 0 ? (
            <div className="empty-state" style={{ border: 'none', marginTop: '2rem' }}>
              No salary data available. Edit a job application to add expected or offered salaries.
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salaryData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `₹${value}L`} />
                  <Tooltip 
                    cursor={{ fill: 'var(--bg-surface-hover)' }}
                    contentStyle={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)' }}
                    formatter={(value: any) => [`₹${value} LPA`, '']}
                  />
                  <Bar dataKey="Expected" fill="var(--text-muted)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Offered" fill="var(--accent-primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      <JobModal 
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingJob(null); }}
        onSave={handleSaveJob}
        initialData={editingJob || undefined}
      />
      <ConfirmDialog 
        open={deleteConfirm.isOpen}
        title="Delete Application"
        message="Are you sure you want to delete this job application? This action cannot be undone."
        onConfirm={confirmDeleteJob}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: '' })}
      />
    </div>
  );
};
