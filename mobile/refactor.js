const fs = require("fs");
let content = fs.readFileSync("src/screens/DashboardScreen.tsx", "utf8");

const idxStart = content.indexOf("{(() => {\n                          const agendaItems: any[] = [];");

const targetEndStr = "</TouchableOpacity>\n                          ));\n                        })()}";
const idxEnd = content.indexOf(targetEndStr) + targetEndStr.length;

let blockToMove = content.substring(idxStart, idxEnd);

content = content.replace(blockToMove, "{agendaItemsElements}");

let useMemoBody = blockToMove
  .replace("{(() => {", "")
  .replace(/}\)\(\)\}$/, "");

const useMemoCode = `
  const agendaItemsElements = React.useMemo(() => {
${useMemoBody}
  }, [todayGym, isGymScheduled, plannedDay, colors, navigation, todayClasses, attendanceLogs, todayStr, todayTasks, todayEvents]);
`;

const returnIdx = content.indexOf("  return (\n    <SafeAreaView");

content = content.substring(0, returnIdx) + useMemoCode + "\n" + content.substring(returnIdx);

fs.writeFileSync("src/screens/DashboardScreen.tsx", content, "utf8");

