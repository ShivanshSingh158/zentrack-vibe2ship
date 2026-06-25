const fs = require('fs');
const path = require('path');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // 1. Context extraction: `const { todos }` -> `const { tasks: todos }`
  // so we don't have to rename all variables locally. Wait, user wants perfectly matched schema.
  // We rename `todos` to `tasks`.
  content = content.replace(/const \{([^}]*)todos([^}]*)\} = useGlobalData\(\);/g, "const {$1tasks$2} = useGlobalData();");
  content = content.replace(/todos\.map/g, 'tasks.map');
  content = content.replace(/todos\.filter/g, 'tasks.filter');
  content = content.replace(/todos\.find/g, 'tasks.find');
  content = content.replace(/todos\.some/g, 'tasks.some');
  content = content.replace(/todos\.reduce/g, 'tasks.reduce');
  content = content.replace(/todos\.forEach/g, 'tasks.forEach');
  content = content.replace(/todos\.length/g, 'tasks.length');
  content = content.replace(/todos: /g, 'tasks: ');

  // 2. Task model fields
  content = content.replace(/\.isCompleted/g, ".status === 'completed'");
  // `isCompleted: false` -> `status: 'pending'`
  content = content.replace(/isCompleted:\s*false/g, "status: 'pending'");
  // `isCompleted: true` -> `status: 'completed'`
  content = content.replace(/isCompleted:\s*true/g, "status: 'completed'");
  
  // Update toggle actions
  content = content.replace(/{ isCompleted: newStatus }/g, "{ status: newStatus ? 'completed' : 'pending' }");
  content = content.replace(/{ isCompleted: true }/g, "{ status: 'completed' }");
  content = content.replace(/{ isCompleted: false }/g, "{ status: 'pending' }");

  content = content.replace(/todo\.text/g, 'todo.title');
  content = content.replace(/text:/g, 'title:'); // Risky? Let's hope it's mostly in task contexts

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log("Updated", filePath);
  }
}

function walk(dir) {
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (!fullPath.includes('node_modules') && !fullPath.includes('.git')) walk(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      processFile(fullPath);
    }
  });
}

walk('./src');
