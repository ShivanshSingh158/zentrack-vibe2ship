import { StyleSheet } from 'react-native';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';

export const blockStyles = StyleSheet.create({
  taskBlock: {
    position: 'absolute',
    left: SPACE.sm,
    right: 0,
    borderRadius: RADIUS.md,
    padding: SPACE.sm,
    paddingLeft: SPACE.md + 4,
    overflow: 'hidden',
  },
  dragHandle: {
    position: 'absolute',
    left: 5,
    top: 0,
    bottom: 0,
    width: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 3,
  },
  dragDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    opacity: 0.7,
  },
  taskTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.sm,
    marginBottom: 3,
  },
  taskSubtext: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskTime: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 10,
  },
  statusBadge: {
    position: 'absolute' as const,
    top: 5,
    right: 6,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
});

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: SPACE.xs,
  },
  content: {
    paddingBottom: 140,
    position: 'relative',
  },
  hourRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  timeLabel: {
    width: 65,
    textAlign: 'right',
    paddingRight: SPACE.sm,
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.xs,
    marginTop: -7,
  },
  hourLine: {
    flex: 1,
    height: 1,
  },
  tasksContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 65,
    right: SPACE.md,
  },
  staticBlock: {
    position: 'absolute',
    left: SPACE.sm,
    right: 0,
    borderRadius: RADIUS.md,
    padding: SPACE.sm,
    overflow: 'hidden',
  },
  classBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
    gap: 4,
  },
  classTypeTag: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  taskTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.sm,
    marginBottom: 3,
  },
  taskSubtext: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskTime: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 10,
  },
  currentTimeIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 100,
    pointerEvents: 'none',
  },
  currentTimeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 4,
  },
  currentTimeLine: {
    flex: 1,
    height: 2,
    marginLeft: 2,
  },
});
