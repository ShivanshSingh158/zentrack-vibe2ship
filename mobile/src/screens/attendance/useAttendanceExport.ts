/**
 * useAttendanceExport.ts — ZenTrack Attendance Module
 *
 * CSV export flow — expo-file-system and expo-sharing moved here.
 * These native modules are heavy but only used when user explicitly
 * taps "Export". Keeping them in this sub-file removes them from
 * the AttendanceScreen parse path.
 *
 * Extracted from AttendanceScreen.tsx (was handleExportCSV, lines 528–634).
 */
import { useCallback } from 'react';
import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getLocalDateString } from './attendanceConstants';

function formatDateNumeric(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d}-${monthNames[parseInt(m, 10) - 1]}-${y}`;
}

export function useAttendanceExport(
  logs: any[],
  holidays: string[],
  subjects: any[],
) {
  const handleExportCSV = useCallback(async () => {
    try {
      // Collect all unique dates
      const allDatesSet = new Set<string>();
      logs.forEach((l: any) => allDatesSet.add(l.date));
      holidays.forEach((d: string) => allDatesSet.add(d));
      const allDates = Array.from(allDatesSet).sort();

      if (allDates.length === 0 && subjects.length === 0) {
        Alert.alert('Nothing to export', 'No attendance data found yet.');
        return;
      }

      // Index logs per session: key = date__subjectId__type__idx -> action
      // Previously key lacked idx — last-written log overwrote earlier ones for the same day/type,
      // silently dropping the other session's recorded status from the export.
      const logIndex: Record<string, string> = {};
      logs.forEach((l: any) => {
        const type = l.type === 'lab' ? 'lab' : 'class';
        const idx  = l.idx ?? 0;
        const key  = `${l.date}__${l.subjectId}__${type}__${idx}`;
        if (!logIndex[key]) logIndex[key] = l.action; // first write wins (logs already newest-first)
      });

      // Returns the max session count for a given subject+type across all scheduled days.
      const getSessionCount = (subj: any, type: 'class' | 'lab'): number => {
        let max = 0;
        Object.values(subj.schedule ?? {}).forEach((sch: any) => {
          const count = type === 'class'
            ? (sch?.classes?.length || sch?.classCount || 0)
            : (sch?.labs?.length   || sch?.labCount   || 0);
          if (count > max) max = count;
        });
        return max || 1;
      };

      const cellValue = (date: string, subjectId: string, type: 'class' | 'lab', sessionCount: number): string => {
        if (holidays.includes(date)) return 'Hol';
        const parts: string[] = [];
        for (let i = 0; i < sessionCount; i++) {
          const action = logIndex[`${date}__${subjectId}__${type}__${i}`];
          if (!action) { parts.push('-'); continue; }
          if (action === 'attended')  parts.push('P');
          else if (action === 'missed')    parts.push('A');
          else if (action === 'cancelled') parts.push('Can');
          else parts.push(action.charAt(0).toUpperCase());
        }
        // Single session: return plain value. Multiple: join with slash e.g. "P/A"
        return parts.length === 1 ? parts[0] : parts.join('/');
      };

      const hasLab = (subj: any): boolean =>
        Object.values(subj.schedule ?? {}).some(
          (sch: any) => (sch?.labs?.length > 0) || (sch?.labCount > 0)
        );

      interface Col { subjectId: string; subjectName: string; type: 'class' | 'lab'; sessionCount: number; }
      const cols: Col[] = [];
      subjects.forEach((s: any) => {
        const classCount = getSessionCount(s, 'class');
        const labCount   = getSessionCount(s, 'lab');
        cols.push({ subjectId: s.id, subjectName: s.name, type: 'class', sessionCount: classCount });
        if (hasLab(s)) cols.push({ subjectId: s.id, subjectName: s.name, type: 'lab', sessionCount: labCount });
      });

      const esc = (v: string) => v.includes(',') ? `"${v}"` : v;
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const rows: string[] = [];
      const exportDate = formatDateNumeric(getLocalDateString(new Date()));

      rows.push(`ZenTrack Attendance Report,Generated: ${exportDate}`);
      rows.push('');
      rows.push(['Date', ...cols.map(c => esc(c.subjectName))].join(','));
      rows.push(['', ...cols.map(c => {
        const typeLabel = c.type === 'lab' ? 'LAB' : 'CLASS';
        return c.sessionCount > 1 ? `${typeLabel}(×${c.sessionCount})` : typeLabel;
      })].join(','));
      rows.push('');

      allDates.forEach(date => {
        const [y, mo, dy] = date.split('-');
        const prettyDate = `${dy}-${monthNames[parseInt(mo, 10) - 1]}-${y}`;
        const cells = cols.map(c => cellValue(date, c.subjectId, c.type, c.sessionCount));
        rows.push([prettyDate, ...cells].join(','));
      });

      rows.push('');
      rows.push('--- SUMMARY ---');
      subjects.forEach((s: any) => {
        const classAtt = s.classesAttended || 0;
        const classTot = s.classesTotal || 0;
        const labAtt   = s.labsAttended  || 0;
        const labTot   = s.labsTotal     || 0;
        const totalAtt = classAtt + labAtt;
        const totalTot = classTot + labTot;
        const pct = totalTot > 0 ? ((totalAtt / totalTot) * 100).toFixed(1) : '--';
        rows.push(`${esc(s.name)},Classes: ${classAtt}/${classTot},Labs: ${labAtt}/${labTot},Combined: ${totalAtt}/${totalTot},${pct}%`);
      });

      rows.push('');
      rows.push('Legend: P = Present | A = Absent | Can = Cancelled | Hol = Holiday | - = No class');

      const csvContent = rows.join('\n');
      const filename = `ZenTrack_Attendance_${new Date().toISOString().split('T')[0]}.csv`;
      const fs = FileSystem as any;
      const fileUri = `${fs.cacheDirectory}${filename}`;
      await fs.writeAsStringAsync(fileUri, csvContent, { encoding: fs.EncodingType.UTF8 });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Export Attendance Report',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert('Error', 'Sharing is not available on this device');
      }
    } catch (err) {
      console.error('[useAttendanceExport]', err);
      Alert.alert('Error', 'Failed to export attendance data');
    }
  }, [logs, holidays, subjects]);

  return { handleExportCSV };
}
