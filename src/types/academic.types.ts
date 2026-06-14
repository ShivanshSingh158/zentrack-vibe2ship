export interface Assignment {
  id?: string;
  userId: string;
  title: string;
  subjectName: string;
  description?: string;
  dueDate: string; // YYYY-MM-DD
  weightage?: number; // % of total marks
  status: 'not_started' | 'in_progress' | 'submitted' | 'graded';
  grade?: string;
  maxMarks?: number;
  obtainedMarks?: number;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Semester {
  id?: string;
  userId: string;
  name: string; // "Semester 1", "Semester 2", etc.
  startDate?: string;
  endDate?: string;
  sgpa?: number;
  totalCredits?: number;
  order: number;
  createdAt: number;
}

export interface SemesterSubject {
  id?: string;
  userId: string;
  semesterId: string;
  name: string;
  credits: number;
  gradePoints?: number; // 10, 9, 8, etc.
  grade?: string; // A+, A, B+, etc.
  internalMarks?: number;
  externalMarks?: number;
  totalMarks?: number;
  maxMarks?: number;
}
