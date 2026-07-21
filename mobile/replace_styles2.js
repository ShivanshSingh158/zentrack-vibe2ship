const fs = require('fs');
const path = require('path');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const styleBlockRegex = /const styles = StyleSheet\.create\(\{([\s\S]*?)\}\);/m;
  const match = content.match(styleBlockRegex);
  if (!match) {
    console.log("Could not find StyleSheet.create in " + filePath);
    return;
  }
  
  let extractedStyles = [];
  let counter = 100;
  let newContent = "";
  
  let i = 0;
  while (i < content.length) {
    if (content.substr(i, 8) === 'style={{') {
      let start = i + 7;
      let braceCount = 0;
      let j = start;
      while (j < content.length) {
        if (content[j] === '{') braceCount++;
        else if (content[j] === '}') braceCount--;
        if (braceCount === 0) break;
        j++;
      }
      let styleObj = content.substring(start, j + 1);
      let styleName = 'autoStyle' + counter++;
      extractedStyles.push(`  ${styleName}: ${styleObj},`);
      newContent += `style={styles.${styleName}}`;
      i = j + 1;
    } else if (content.substr(i, 25) === 'contentContainerStyle={{') {
      let start = i + 24;
      let braceCount = 0;
      let j = start;
      while (j < content.length) {
        if (content[j] === '{') braceCount++;
        else if (content[j] === '}') braceCount--;
        if (braceCount === 0) break;
        j++;
      }
      let styleObj = content.substring(start, j + 1);
      let styleName = 'autoStyle' + counter++;
      extractedStyles.push(`  ${styleName}: ${styleObj},`);
      newContent += `contentContainerStyle={styles.${styleName}}`;
      i = j + 1;
    } else {
      newContent += content[i];
      i++;
    }
  }
  
  if (extractedStyles.length > 0) {
    const replacementMatch = newContent.match(styleBlockRegex);
    const existingStyles = replacementMatch[1];
    const newStylesBlock = `const styles = StyleSheet.create({${existingStyles}\n  // Extracted contentContainerStyles\n${extractedStyles.join('\n')}\n});`;
    newContent = newContent.replace(styleBlockRegex, newStylesBlock);
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`Replaced ${extractedStyles.length} more styles in ${path.basename(filePath)}`);
  }
}

processFile(path.join(__dirname, 'src/screens/TasksScreen.tsx'));
processFile(path.join(__dirname, 'src/screens/NotesScreen.tsx'));
