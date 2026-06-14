import type React from 'react';
import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import type { JobApplication, StorageNode } from '../../types/index';
import { getLocalDateString } from '../../utils/dateUtils';
// @ts-ignore
import FocusTrap from 'focus-trap-react';

export interface JobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (job: Partial<JobApplication>) => Promise<void>;
  initialData?: JobApplication;
}

export const JobModal: React.FC<JobModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('');
  const [source, setSource] = useState('');
  const [status, setStatus] = useState<JobApplication['status']>('wishlist');
  const [dateApplied, setDateApplied] = useState('');
  const [interviewDate, setInterviewDate] = useState('');
  const [learningTopicId, setLearningTopicId] = useState('');
  const [expectedSalary, setExpectedSalary] = useState('');
  const [offeredSalary, setOfferedSalary] = useState('');
  const [notes, setNotes] = useState('');
  const [url, setUrl] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [attachedFileIds, setAttachedFileIds] = useState<string[]>([]);
  const [prepChecklist, setPrepChecklist] = useState<{id: string, text: string, done: boolean}[]>([
    { id: '1', text: 'Research the company thoroughly', done: false },
    { id: '2', text: 'Review the job description', done: false },
    { id: '3', text: 'Prepare STAR stories', done: false },
    { id: '4', text: 'Practice coding/technical questions', done: false },
    { id: '5', text: 'Prepare questions to ask', done: false },
    { id: '6', text: 'Test setup (camera/mic/internet)', done: false },
  ]);
  
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [learningTopics, setLearningTopics] = useState<{id: string, title: string}[]>([]);
  const [storageNodes, setStorageNodes] = useState<StorageNode[]>([]);
  const [showAttachmentPicker, setShowAttachmentPicker] = useState(false);

  useEffect(() => {
    if (isOpen && auth.currentUser) {
      const q = query(collection(db, 'learning_topics'), where('userId', '==', auth.currentUser.uid));
      getDocs(q).then(snap => {
        setLearningTopics(snap.docs.map(d => ({ id: d.id, title: d.data().title })));
      }).catch(err => console.error("Error loading topics:", err));

      const sq = query(collection(db, 'storage_nodes'), where('userId', '==', auth.currentUser.uid));
      getDocs(sq).then(snap => {
        const nodes = snap.docs.map(d => ({ id: d.id, ...d.data() })) as StorageNode[];
        setStorageNodes(nodes.filter(n => n.type === 'file' || n.type === 'note'));
      }).catch(err => console.error("Error loading storage:", err));
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialData) {
      setCompany(initialData.company || '');
      setRole(initialData.role || '');
      setLocation(initialData.location || '');
      setSource(initialData.source || '');
      setStatus(initialData.status || 'wishlist');
      setDateApplied(initialData.dateApplied || '');
      setInterviewDate(initialData.interviewDate || '');
      setLearningTopicId(initialData.learningTopicId || '');
      setExpectedSalary(initialData.expectedSalary || initialData.salary || '');
      setOfferedSalary(initialData.offeredSalary || '');
      setNotes(initialData.notes || '');
      setUrl(initialData.url || '');
      setJobDescription(initialData.jobDescription || '');
      setCoverLetter(initialData.coverLetter || '');
      setAttachedFileIds(initialData.attachedFileIds || []);
      if (initialData.prepChecklist && initialData.prepChecklist.length > 0) {
        setPrepChecklist(initialData.prepChecklist);
      }
    } else {
      setCompany('');
      setRole('');
      setLocation('');
      setSource('');
      setStatus('wishlist');
      setDateApplied(getLocalDateString(new Date()));
      setInterviewDate('');
      setLearningTopicId('');
      setExpectedSalary('');
      setOfferedSalary('');
      setNotes('');
      setUrl('');
      setJobDescription('');
      setCoverLetter('');
      setAttachedFileIds([]);
      setShowAdvanced(false);
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim() || !role.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSave({
        ...(initialData ? { id: initialData.id } : {}),
        company: company.trim(),
        role: role.trim(),
        location: location.trim(),
        source: source.trim(),
        status,
        dateApplied,
        interviewDate: status === 'interviewing' ? interviewDate : '',
        learningTopicId,
        expectedSalary: expectedSalary.trim(),
        offeredSalary: offeredSalary.trim(),
        notes: notes.trim(),
        url: url.trim(),
        jobDescription: jobDescription.trim(),
        coverLetter: coverLetter.trim(),
        attachedFileIds,
        prepChecklist: status === 'interviewing' ? prepChecklist : [],
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onPointerDown={onClose}>
      <FocusTrap focusTrapOptions={{ initialFocus: '#company', fallbackFocus: '.modal-content' }}>
        <div 
          className="modal-content" 
          onPointerDown={(e) => e.stopPropagation()} 
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="job-modal-title"
        >
          <h2 id="job-modal-title" className="modal-header">
            {initialData ? 'Edit Application' : 'New Application'}
          </h2>
          
          <form onSubmit={handleSubmit}>
            <div className="form-row">
            <div className="form-group">
              <label htmlFor="company">Company</label>
              <input 
                id="company" 
                list="indian-companies"
                type="text" 
                value={company} 
                onChange={e => setCompany(e.target.value)} 
                required 
                placeholder="e.g. TCS, Flipkart" 
              />
              <datalist id="indian-companies">
                <option value="TCS" />
                <option value="Infosys" />
                <option value="Wipro" />
                <option value="Tech Mahindra" />
                <option value="HCLTech" />
                <option value="Reliance" />
                <option value="Flipkart" />
                <option value="Amazon India" />
                <option value="Google India" />
                <option value="Zomato" />
                <option value="Swiggy" />
                <option value="Paytm" />
                <option value="Zerodha" />
                <option value="PhonePe" />
                <option value="Razorpay" />
                <option value="Cred" />
              </datalist>
            </div>
            <div className="form-group">
              <label htmlFor="role">Role</label>
              <input id="role" type="text" value={role} onChange={e => setRole(e.target.value)} required placeholder="e.g. SDE 2, Frontend Engineer" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="location">Location (Optional)</label>
              <input 
                id="location" 
                list="job-locations"
                type="text" 
                value={location} 
                onChange={e => setLocation(e.target.value)} 
                placeholder="e.g. Bengaluru, Remote" 
              />
              <datalist id="job-locations">
                <option value="Bengaluru" />
                <option value="Gurugram" />
                <option value="Mumbai" />
                <option value="Pune" />
                <option value="Hyderabad" />
                <option value="Noida" />
                <option value="Chennai" />
                <option value="Delhi NCR" />
                <option value="Remote" />
                <option value="Hybrid" />
              </datalist>
            </div>
            <div className="form-group">
              <label htmlFor="source">Source (Optional)</label>
              <input 
                id="source" 
                list="job-sources"
                type="text" 
                value={source} 
                onChange={e => setSource(e.target.value)} 
                placeholder="e.g. Naukri, Instahyre" 
              />
              <datalist id="job-sources">
                <option value="Naukri" />
                <option value="Instahyre" />
                <option value="LinkedIn" />
                <option value="Foundit" />
                <option value="Cutshort" />
                <option value="Wellfound" />
                <option value="Referral" />
                <option value="Company Website" />
                <option value="Recruiter" />
              </datalist>
            </div>
          </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="status">Status</label>
                <select id="status" value={status} onChange={e => setStatus(e.target.value as JobApplication['status'])}>
                  <option value="wishlist">Wishlist</option>
                  <option value="applied">Applied</option>
                  <option value="interviewing">Interviewing</option>
                  <option value="offer">Offer</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="dateApplied">Date Applied</label>
                <input id="dateApplied" type="date" value={dateApplied} onChange={e => setDateApplied(e.target.value)} required />
              </div>
            </div>

            <div style={{ margin: '1rem 0' }}>
              <button 
                type="button" 
                onClick={() => setShowAdvanced(!showAdvanced)} 
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem', cursor: 'pointer', textAlign: 'center', width: '100%', padding: '0.5rem', fontWeight: 500, transition: 'background 0.2s' }}
              >
                {showAdvanced ? 'Hide Advanced Details ↑' : 'Show Advanced Details (Salary, Links, Notes...) ↓'}
              </button>
            </div>

            {showAdvanced && (
              <>
                {status === 'interviewing' && (
                  <div className="form-group">
                    <label htmlFor="interviewDate">Interview Date</label>
                    <input id="interviewDate" type="date" value={interviewDate} onChange={e => setInterviewDate(e.target.value)} />
                  </div>
                )}

                {status === 'interviewing' && (
                  <div className="form-group">
                    <label style={{ marginBottom: '0.5rem' }}>Interview Prep Checklist</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--bg-base)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                      {prepChecklist.map((item, idx) => (
                        <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={item.done}
                            onChange={e => {
                              const updated = [...prepChecklist];
                              updated[idx] = { ...updated[idx], done: e.target.checked };
                              setPrepChecklist(updated);
                            }}
                          />
                          <span style={{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                            {item.text}
                          </span>
                        </label>
                      ))}
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <input
                          type="text"
                          placeholder="Add custom prep item..."
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const val = (e.target as HTMLInputElement).value.trim();
                              if (val) {
                                setPrepChecklist(prev => [...prev, { id: String(Date.now()), text: val, done: false }]);
                                (e.target as HTMLInputElement).value = '';
                              }
                            }
                          }}
                          style={{ flex: 1, padding: '0.4rem 0.6rem', fontSize: '0.85rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '4px', color: 'var(--text-primary)' }}
                        />
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        {prepChecklist.filter(i => i.done).length}/{prepChecklist.length} completed
                      </div>
                    </div>
                  </div>
                )}

            <div className="form-group">
              <label htmlFor="learningTopicId">Linked Learning Topic (Optional)</label>
              <select id="learningTopicId" value={learningTopicId} onChange={e => setLearningTopicId(e.target.value)}>
                <option value="">-- None --</option>
                {learningTopics.map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="expectedSalary">Expected Salary</label>
                <input id="expectedSalary" type="text" value={expectedSalary} onChange={e => setExpectedSalary(e.target.value)} placeholder="e.g. ₹15 LPA or 1500000" />
              </div>
              <div className="form-group">
                <label htmlFor="offeredSalary">Offered Salary</label>
                <input id="offeredSalary" type="text" value={offeredSalary} onChange={e => setOfferedSalary(e.target.value)} placeholder="e.g. ₹18 LPA or 1800000" />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="url">URL (Optional)</label>
              <input id="url" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." />
            </div>

            <div className="form-group">
              <label htmlFor="jobDescription">Job Description</label>
              <textarea id="jobDescription" value={jobDescription} onChange={e => setJobDescription(e.target.value)} rows={3} placeholder="Paste the full job description here..." />
            </div>

            <div className="form-group">
              <label htmlFor="coverLetter">Cover Letter</label>
              <textarea 
                id="coverLetter" 
                value={coverLetter} 
                onChange={e => setCoverLetter(e.target.value)} 
                rows={5} 
                placeholder="Write a cover letter..." 
              />
            </div>

            <div className="form-group">
              <label>Attachments</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--bg-base)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                {attachedFileIds.length > 0 ? (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {attachedFileIds.map(id => {
                      const file = storageNodes.find(n => n.id === id);
                      return (
                        <li key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)', padding: '0.5rem 0.75rem', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                          <span style={{ fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file?.name || 'Unknown File'}</span>
                          <button type="button" onClick={() => setAttachedFileIds(prev => prev.filter(fid => fid !== id))} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No files attached</div>
                )}
                
                {showAttachmentPicker ? (
                  <div style={{ marginTop: '0.5rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.5rem' }}>
                    <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {storageNodes.length === 0 ? (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No files found in Storage</div>
                      ) : (
                        storageNodes.map(node => (
                          <label key={node.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', padding: '0.25rem', cursor: 'pointer' }}>
                            <input 
                              type="checkbox" 
                              checked={attachedFileIds.includes(node.id!)}
                              onChange={(e) => {
                                if (e.target.checked) setAttachedFileIds(prev => [...prev, node.id!]);
                                else setAttachedFileIds(prev => prev.filter(id => id !== node.id!));
                              }}
                            />
                            {node.name}
                          </label>
                        ))
                      )}
                    </div>
                    <button type="button" className="btn-secondary" style={{ width: '100%', marginTop: '0.5rem', padding: '0.25rem' }} onClick={() => setShowAttachmentPicker(false)}>Done</button>
                  </div>
                ) : (
                  <button type="button" className="btn-secondary" style={{ alignSelf: 'flex-start', padding: '0.25rem 0.75rem', fontSize: '0.8rem' }} onClick={() => setShowAttachmentPicker(true)}>+ Attach File</button>
                )}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="notes">Notes (Optional)</label>
              <textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Add any details..." />
            </div>
            </>
            )}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={isSubmitting}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={!company.trim() || !role.trim() || isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Job'}
              </button>
            </div>
          </form>
        </div>
      </FocusTrap>
    </div>
  );
};
