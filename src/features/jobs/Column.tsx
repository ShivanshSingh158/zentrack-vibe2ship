import React from 'react';
import type { JobApplication } from '../../types/index';
import { JobCard } from './JobCard';
import { SkeletonCard } from '../../components/ui/SkeletonCard';
import { Droppable } from '@hello-pangea/dnd';

export interface ColumnProps {
  title: string;
  status: JobApplication['status'];
  jobs: JobApplication[];
  isLoading?: boolean;
  onEditJob: (job: JobApplication) => void;
  onDeleteJob: (id: string) => void;
  onQuickUpdate: (id: string, data: Partial<JobApplication>) => void;
  topicTitleMap?: Record<string, string>;
}

export const Column = React.memo(({ title, status, jobs, isLoading, onEditJob, onDeleteJob, onQuickUpdate, topicTitleMap }: ColumnProps) => {
  return (
    <div className="column">
      <div className="column-header">
        <h2 className="column-title">{title}</h2>
        <span className="column-count">{isLoading ? '-' : jobs.length}</span>
      </div>
      
      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div 
            className="cards-container"
            ref={provided.innerRef}
            {...provided.droppableProps}
            style={{
              minHeight: '100px',
              backgroundColor: snapshot.isDraggingOver ? 'var(--bg-surface-hover)' : 'transparent',
              borderRadius: 'var(--radius-md)',
              transition: 'background-color 0.2s ease',
              flex: 1,
            }}
          >
            {isLoading ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : jobs.length === 0 ? (
              <div className="empty-state">
                No applications here yet.<br />Drop one to update status.
              </div>
            ) : (
              jobs.map((job, index) => (
                <JobCard 
                  key={job.id} 
                  job={job} 
                  index={index}
                  onEdit={onEditJob} 
                  onDelete={onDeleteJob} 
                  onQuickUpdate={onQuickUpdate}
                  learningTopicTitle={job.learningTopicId ? topicTitleMap?.[job.learningTopicId] : undefined}
                />
              ))
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
});
Column.displayName = 'Column';
