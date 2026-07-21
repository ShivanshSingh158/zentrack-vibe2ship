const { Project, SyntaxKind } = require('ts-morph');
const fs = require('fs');

async function run() {
  const project = new Project({
    tsConfigFilePath: 'tsconfig.json',
  });

  const sourceFiles = project.getSourceFiles('src/**/*.tsx').concat(project.getSourceFiles('src/**/*.ts'));
  console.log(`Found ${sourceFiles.length} files to check.`);
  let modifiedCount = 0;

  for (const sourceFile of sourceFiles) {
    if (sourceFile.getFilePath().includes('SettingsScreen.tsx')) continue;
    if (sourceFile.getFilePath().includes('tokens.ts')) continue;
    if (sourceFile.getFilePath().includes('ThemeContext.tsx')) continue;

    const imports = sourceFile.getImportDeclarations();
    let hasColorsImport = false;
    let themeContextPath = '';

    for (const imp of imports) {
      const moduleSpecifier = imp.getModuleSpecifierValue();
      if (moduleSpecifier.includes('theme/tokens')) {
        const namedImports = imp.getNamedImports();
        const colorsImport = namedImports.find(n => n.getName() === 'COLORS');
        
        if (colorsImport) {
          hasColorsImport = true;
          themeContextPath = moduleSpecifier.replace('theme/tokens', 'contexts/ThemeContext');
          
          if (namedImports.length === 1) {
            imp.remove();
          } else {
            colorsImport.remove();
          }
        }
      }
    }

    if (!hasColorsImport) continue;

    // 1. Add ThemeContext import
    sourceFile.addImportDeclaration({
      namedImports: ['useTheme'],
      moduleSpecifier: themeContextPath,
    });

    // 2. Change StyleSheet.create to makeStyles
    let styleVarName = '';
    const variableStatements = sourceFile.getVariableStatements();
    for (const varStmt of variableStatements) {
      const declarations = varStmt.getDeclarations();
      for (const decl of declarations) {
        const initializer = decl.getInitializer();
        if (initializer && initializer.getKind() === SyntaxKind.CallExpression) {
          const expression = initializer.getExpression();
          if (expression.getText() === 'StyleSheet.create') {
            styleVarName = decl.getName();
            const args = initializer.getArguments();
            if (args.length > 0) {
              const obj = args[0].getText();
              decl.replaceWithText(`makeStyles = (colors: any) => StyleSheet.create(${obj})`);
            }
          }
        }
      }
    }

    // 3. Inject useTheme into the component
    let injected = false;
    
    // Check standard function declarations
    const functions = sourceFile.getFunctions();
    for (const func of functions) {
      const name = func.getName();
      // Inject if it's a React component (PascalCase or default export)
      if ((name && name[0] === name[0].toUpperCase()) || func.isDefaultExport()) {
        func.insertStatements(0, `const { colors, isDark } = useTheme();\n${styleVarName ? `const ${styleVarName} = makeStyles(colors);` : ''}`);
        injected = true;
      }
    }
    
    // Check arrow functions assigned to variables
    if (!injected) {
      for (const varStmt of variableStatements) {
        for (const decl of varStmt.getDeclarations()) {
          const name = decl.getName();
          if (name && name[0] === name[0].toUpperCase()) {
            const initializer = decl.getInitializer();
            if (initializer && initializer.getKind() === SyntaxKind.ArrowFunction) {
              const arrowFunc = initializer.asKind(SyntaxKind.ArrowFunction);
              if (arrowFunc) {
                const body = arrowFunc.getBody();
                if (body.getKind() === SyntaxKind.Block) {
                   arrowFunc.insertStatements(0, `const { colors, isDark } = useTheme();\n${styleVarName ? `const ${styleVarName} = makeStyles(colors);` : ''}`);
                   injected = true;
                }
              }
            }
          }
        }
      }
    }

    // 4. Replace COLORS with colors
    const identifiers = sourceFile.getDescendantsOfKind(SyntaxKind.Identifier).filter(i => i.getText() === 'COLORS');
    for (const id of identifiers) {
      id.replaceWithText('colors');
    }

    if (!injected && styleVarName) {
      console.warn(`WARNING: Could not inject useTheme in ${sourceFile.getBaseName()}`);
    }

    sourceFile.saveSync();
    console.log(`Refactored ${sourceFile.getBaseName()}`);
    modifiedCount++;
  }

  console.log(`Successfully refactored ${modifiedCount} files.`);
}

run().catch(console.error);