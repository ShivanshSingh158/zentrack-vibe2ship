/**
 * Calendar Feature Slice — ZenTrack Mobile
 * Consolidates month pager, daily schedule timeline, timetable periods, and holiday overlays.
 */

// --- Screen ---
export { default as CalendarScreen } from '../../screens/CalendarScreen';

// --- Hooks ---
export * from '../../screens/calendar/useCalendarData';

// --- Components & Sub-Views ---
export { default as CalendarAgendaView } from '../../screens/calendar/CalendarAgendaView';
export { CalendarDayView } from '../../screens/calendar/CalendarDayView';
export { AddEventModal } from '../../components/Calendar/AddEventModal';
export { EventDetailSheet } from '../../screens/calendar/EventDetailSheet';
