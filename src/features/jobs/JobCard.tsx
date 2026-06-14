import React, { useState } from 'react';
import type { JobApplication } from '../../types/index';
import { Pencil, Trash2, Building2, Calendar, IndianRupee, Clock, BookOpen, Bell, BellRing, FileText, ChevronDown, ChevronUp, Paperclip, MapPin, Link2 } from 'lucide-react';
import { Draggable } from '@hello-pangea/dnd';

export interface JobCardProps {
  job: JobApplication;
  index: number;
  onEdit: (job: JobApplication) => void;
  onDelete: (id: string) => void;
  onQuickUpdate: (id: string, data: Partial<JobApplication>) => void;
  learningTopicTitle?: string;
}

export const JobCard = React.memo(({ job, index, onEdit, onDelete, onQuickUpdate, learningTopicTitle }: JobCardProps) => {
  const [showCoverLetter, setShowCoverLetter] = useState(false);
  if (!job.id) return null;

  const formattedDate = new Date(job.dateApplied).toLocaleDateString(undefined, { 
    month: 'short', day: 'numeric', year: 'numeric' 
  });

  let daysToInterview: number | null = null;
  if (job.status === 'interviewing' && job.interviewDate) {
    const diff = new Date(job.interviewDate).getTime() - new Date().getTime();
    daysToInterview = Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  const hasFollowUp = !!job.followUpDate;
  
  const toggleFollowUp = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasFollowUp) {
      onQuickUpdate(job.id!, { followUpDate: null as any });
    } else {
      let followUpTime = Date.now() + 5 * 24 * 60 * 60 * 1000; // 5 days from now
      if (job.interviewDate) {
        const interviewTime = new Date(job.interviewDate).getTime();
        followUpTime = interviewTime - 5 * 24 * 60 * 60 * 1000;
        if (followUpTime < Date.now()) {
          // If 5 days before interview is in the past, just set it to 1 day before
          followUpTime = interviewTime - 1 * 24 * 60 * 60 * 1000;
        }
      }
      onQuickUpdate(job.id!, { followUpDate: followUpTime });
    }
  };

  return (
    <Draggable draggableId={job.id} index={index}>
      {(provided, snapshot) => (
        <div 
          className="job-card" 
          onClick={() => onEdit(job)}
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          style={{
            ...provided.draggableProps.style,
            opacity: snapshot.isDragging ? 0.9 : 1,
            transform: snapshot.isDragging ? provided.draggableProps.style?.transform : undefined,
            boxShadow: snapshot.isDragging ? '0 25px 50px -12px rgba(0,0,0,0.5), var(--shadow-glow)' : undefined,
            zIndex: snapshot.isDragging ? 100 : 1,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 className="job-role">{job.role}</h3>
              <div className="job-company" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Building2 size={13} />
                  {job.company}
                </span>
                {job.location && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-secondary)' }}>
                    <MapPin size={12} />
                    {job.location}
                  </span>
                )}
                {job.source && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-secondary)' }}>
                    <Link2 size={12} />
                    {job.source}
                  </span>
                )}
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '0.2rem' }}>
              <button 
                className="btn-icon" 
                onClick={toggleFollowUp}
                title={hasFollowUp ? "Cancel Reminder" : "Remind me in 3 days"}
                style={{ color: hasFollowUp ? '#fbbf24' : 'var(--text-muted)' }}
              >
                {hasFollowUp ? <BellRing size={14} /> : <Bell size={14} />}
              </button>
              <button 
                className="btn-icon" 
                onClick={(e) => { e.stopPropagation(); onEdit(job); }}
                title="Edit"
              >
                <Pencil size={14} />
              </button>
              <button 
                className="btn-icon danger" 
                onClick={(e) => { e.stopPropagation(); onDelete(job.id!); }}
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {(job.expectedSalary || job.offeredSalary || job.salary || job.dateApplied || daysToInterview !== null) && (
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Calendar size={12} />
                {formattedDate}
              </div>

              {daysToInterview !== null && (
                <div style={{ fontSize: '0.75rem', color: daysToInterview < 0 ? '#ef4444' : '#fbbf24', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
                  <Clock size={12} />
                  {daysToInterview < 0 ? 'Interview passed' : `In ${daysToInterview} days`}
                </div>
              )}
              
              {job.salary && !job.expectedSalary && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <IndianRupee size={12} />
                  {job.salary}
                </div>
              )}

              {job.expectedSalary && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }} title="Expected / Posted Salary">
                  <IndianRupee size={12} />
                  {job.expectedSalary} (Exp)
                </div>
              )}

              {job.offeredSalary && (
                <div style={{ fontSize: '0.75rem', color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 500 }} title="Actual Offer">
                  <IndianRupee size={12} />
                  {job.offeredSalary} (Offered)
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span className={`tag ${job.status}`}>
              {job.status.replace('-', ' ')}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {job.coverLetter && (
                <button 
                  onClick={(e) => { e.stopPropagation(); setShowCoverLetter(!showCoverLetter); }} 
                  style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-secondary)', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer' }}
                >
                  <FileText size={10} />
                  Cover Letter {showCoverLetter ? <ChevronUp size={10}/> : <ChevronDown size={10}/>}
                </button>
              )}
              {learningTopicTitle && (
                <span title="Linked Learning Topic" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--primary-light)', background: 'rgba(129, 140, 248, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                  <BookOpen size={10} />
                  {learningTopicTitle}
                </span>
              )}
              {job.attachedFileIds && job.attachedFileIds.length > 0 && (
                <span title={`${job.attachedFileIds.length} Attached File(s)`} style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--accent-primary)', background: 'rgba(16, 185, 129, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                  <Paperclip size={10} />
                  {job.attachedFileIds.length}
                </span>
              )}
            </div>
          </div>
          
          {showCoverLetter && job.coverLetter && (
            <div 
              style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', maxHeight: '150px', overflowY: 'auto', cursor: 'auto' }}
              onClick={e => e.stopPropagation()}
            >
              {job.coverLetter}
            </div>
          )}

        </div>
      )}
    </Draggable>
  );
});
JobCard.displayName = 'JobCard';
