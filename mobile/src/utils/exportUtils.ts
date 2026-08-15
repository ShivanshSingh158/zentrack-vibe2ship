import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export const exportAnalyticsToCSV = async (tasks: any[], habits: any[]) => {
  try {
    let csvContent = 'Type,Title,Status,Date\n';

    // Add tasks
    tasks.forEach(task => {
      const title = task.title?.replace(/,/g, ' ') || 'Untitled';
      const status = task.completed ? 'Completed' : 'Pending';
      const date = task.date || '';
      csvContent += `Task,${title},${status},${date}\n`;
    });

    // Add habits
    habits.forEach(habit => {
      const title = habit.title?.replace(/,/g, ' ') || 'Untitled';
      const status = habit.completedToday ? 'Completed' : 'Pending';
      csvContent += `Habit,${title},${status},Today\n`;
    });

    const fs = FileSystem as any;
    const fileUri = `${fs.documentDirectory}ZenTrack_Analytics_Export.csv`;
    await fs.writeAsStringAsync(fileUri, csvContent, { encoding: fs.EncodingType.UTF8 });

    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Analytics Data' });
    }
  } catch (error) {
    console.error('Error exporting CSV:', error);
  }
};
