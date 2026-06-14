export interface JobApplication {
  id?: string;
  userId?: string;
  company: string;
  role: string;
  location?: string;
  source?: string;
  status: 'wishlist' | 'applied' | 'interviewing' | 'offer' | 'rejected';
  dateApplied: string;
  expectedSalary?: string;
  offeredSalary?: string;
  salary?: string;
  notes?: string;
  url?: string;
  jobDescription?: string;
  coverLetter?: string;
  interviewDate?: string;
  learningTopicId?: string;
  attachedFileIds?: string[];
  followUpDate?: number;
  /** Interview prep checklist items */
  prepChecklist?: { id: string; text: string; done: boolean }[];
}

export interface MockInterviewProblem {
  id?: string;
  userId: string;
  title: string;
  difficulty: string;
  tags: string[];
  optimalTimeComplexity: string;
  optimalSpaceComplexity: string;
  pattern: string;
  similarProblems: string[];
  hints: string[];
  status: 'todo' | 'attempted' | 'mastered';
  lastAttemptedAt?: number;
  createdAt: number;
}
