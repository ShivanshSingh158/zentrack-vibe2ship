/**
 * Academic & College Feature Slice — ZenTrack Mobile
 * Consolidates Attendance tracking, University Criteria (75% rule), Grades (SGPA/CGPA), and Assignments.
 */

// --- Screens ---
export { default as AttendanceScreen } from '../../screens/AttendanceScreen';
export { default as GradesScreen } from '../../screens/GradesScreen';
export { default as AssignmentsScreen } from '../../screens/AssignmentsScreen';

// --- Hooks ---
export * from '../../screens/attendance/useAttendanceData';
export * from '../../screens/attendance/useAttendanceFirestore';

// --- Modals & Skeletons ---
export { AddSubjectModal } from '../../components/Academic/AddSubjectModal';
export { default as AttendanceSkeleton } from '../../components/Academic/AttendanceSkeleton';
