const fs = require('fs');
let code = fs.readFileSync('src/features/gym/GymModule.tsx', 'utf8');

// ExerciseCardProps
code = code.replace(
  "interface ExerciseCardProps {\n  ex: GymExerciseLog;\n  onChange: (ex: GymExerciseLog) => void;\n  onDelete: () => void;\n  onEditClick: () => void;\n  editMode: boolean;\n}",
  "interface ExerciseCardProps {\n  index: number;\n  ex: GymExerciseLog;\n  onUpdate: (idx: number, ex: GymExerciseLog) => void;\n  onDelete: (idx: number) => void;\n  onEditClick: (idx: number) => void;\n  editMode: boolean;\n}"
);

// ExerciseCard signature
code = code.replace(
  "const ExerciseCard = memo(({ ex, onChange, onDelete, onEditClick, editMode }: ExerciseCardProps) => {",
  "const ExerciseCard = memo(({ index, ex, onUpdate, onDelete, onEditClick, editMode }: ExerciseCardProps) => {"
);

// ExerciseCard inner callbacks
code = code.replace(/onChange\(\{\n      \.\.\.ex,\n      setsLog: \[\.\.\.ex\.setsLog, \{/g, "onUpdate(index, {\n      ...ex,\n      setsLog: [...ex.setsLog, {");
code = code.replace(/onChange\(\{ \.\.\.ex, setsLog: updated \}\);/g, "onUpdate(index, { ...ex, setsLog: updated });");

// Edit/Delete buttons inside ExerciseCard
code = code.replace(/onClick=\{e => \{ e\.stopPropagation\(\); onEditClick\(\); \}\}/g, "onClick={e => { e.stopPropagation(); onEditClick(index); }}");
code = code.replace(/onClick=\{e => \{ e\.stopPropagation\(\); onDelete\(\); \}\}/g, "onClick={e => { e.stopPropagation(); onDelete(index); }}");

// SetRow inside ExerciseCard
// We don't need to change SetRowProps if SetRow is only receiving inline functions from ExerciseCard, 
// because ExerciseCard itself is memoized. If ExerciseCard doesn't re-render, SetRow doesn't re-render.
// Let's leave SetRow as is, just the outer ExerciseCard memoization is enough.

// GymModule usage
code = code.replace(
  /              <ExerciseCard\n                key=\{ex\.exerciseId \+ idx\}\n                ex=\{ex\}\n                onChange=\{updated => updateExercise\(idx, updated\)\}\n                onDelete=\{.*\}\n                onEditClick=\{.*\}\n                editMode=\{editMode\}\n              \/>/g,
  "              <ExerciseCard\n                key={ex.exerciseId + idx}\n                index={idx}\n                ex={ex}\n                onUpdate={updateExercise}\n                onDelete={deleteExercise}\n                onEditClick={setEditingExerciseIdx}\n                editMode={editMode}\n              />"
);

fs.writeFileSync('src/features/gym/GymModule.tsx', code);
console.log('done 2');
