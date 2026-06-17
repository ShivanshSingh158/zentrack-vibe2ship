const fs = require('fs');
let code = fs.readFileSync('src/features/gym/GymModule.tsx', 'utf8');

code = code.replace(
  "import { useState, useEffect, useCallback, useRef } from 'react';",
  "import { useState, useEffect, useCallback, useRef, memo } from 'react';"
);

code = code.replace(
  "      await setDoc(doc(db, 'gymLogs', makeDocId(userId, selectedDate)), updated);\n      setLog(updated);",
  "      await setDoc(doc(db, 'gymLogs', makeDocId(userId, selectedDate)), updated);\n      // Do not setLog(updated) here to avoid race condition with fast typing"
);

code = code.replace(
  "const SetRow = ({ set, onChange, onDelete }: SetRowProps) => (",
  "const SetRow = memo(({ set, onChange, onDelete }: SetRowProps) => ("
);

code = code.replace(
  "    </div>\n  </div>\n);\n\ninterface ExerciseCardProps {",
  "    </div>\n  </div>\n));\n\ninterface ExerciseCardProps {"
);

code = code.replace(
  "const ExerciseCard = ({ ex, onChange, onDelete, onEditClick, editMode }: ExerciseCardProps) => {",
  "const ExerciseCard = memo(({ ex, onChange, onDelete, onEditClick, editMode }: ExerciseCardProps) => {"
);

code = code.replace(
  /<motion\.div \n      layout/g,
  "<motion.div "
);

code = code.replace(
  "    </motion.div>\n  );\n};\n\n// ── Add/Edit Exercise Modal",
  "    </motion.div>\n  );\n});\n\n// ── Add/Edit Exercise Modal"
);

const updateEx = `  const updateExercise = useCallback((idx: number, ex: GymExerciseLog) => {
    setLog(prev => {
      if (!prev) return prev;
      const exs = [...prev.exercises];
      exs[idx] = ex;
      const updated = { ...prev, exercises: exs, updatedAt: Date.now() };
      scheduleAutosave(updated);
      return updated;
    });
  }, [scheduleAutosave]);`;
  
code = code.replace(
  /  const updateExercise = \(idx: number, ex: GymExerciseLog\) => \{[\s\S]*?scheduleAutosave\(updated\);\n  \};/,
  updateEx
);

const deleteEx = `  const deleteExercise = useCallback((idx: number) => {
    setLog(prev => {
      if (!prev) return prev;
      const exs = prev.exercises.filter((_, i) => i !== idx);
      const updated = { ...prev, exercises: exs, updatedAt: Date.now() };
      scheduleAutosave(updated);
      return updated;
    });
    toast.success('Exercise removed');
  }, [scheduleAutosave]);`;
code = code.replace(
  /  const deleteExercise = \(idx: number\) => \{[\s\S]*?toast\.success\('Exercise removed'\);\n  \};/,
  deleteEx
);

const updateCardio = `  const updateCardio = useCallback((idx: number, c: GymCardioLog) => {
    setLog(prev => {
      if (!prev) return prev;
      const cArr = prev.cardio ? [...prev.cardio] : [];
      cArr[idx] = c;
      const updated = { ...prev, cardio: cArr, updatedAt: Date.now() };
      scheduleAutosave(updated);
      return updated;
    });
  }, [scheduleAutosave]);`;
code = code.replace(
  /  const updateCardio = \(idx: number, c: GymCardioLog\) => \{[\s\S]*?scheduleAutosave\(updated\);\n  \};/,
  updateCardio
);

const deleteCardio = `  const deleteCardio = useCallback((idx: number) => {
    setLog(prev => {
      if (!prev) return prev;
      const item = (prev.cardio || [])[idx];
      if (item?.isPermanent) { toast.error('Treadmill is always tracked'); return prev; }
      const cArr = (prev.cardio || []).filter((_, i) => i !== idx);
      const updated = { ...prev, cardio: cArr, updatedAt: Date.now() };
      scheduleAutosave(updated);
      return updated;
    });
    toast.success('Cardio removed');
  }, [scheduleAutosave]);`;
code = code.replace(
  /  const deleteCardio = \(idx: number\) => \{[\s\S]*?toast\.success\('Cardio removed'\);\n  \};/,
  deleteCardio
);

fs.writeFileSync('src/features/gym/GymModule.tsx', code);
console.log('done');
