import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Mail, Copy } from 'lucide-react';
import { callWithFallback, parseAIJson } from '../../services/gemini';
import { toast } from 'sonner';

export const ExtensionDraftModal = ({ task, onClose }: { task: any, onClose: () => void }) => {
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<string>('');

  useEffect(() => {
    const generateDraft = async () => {
      const prompt = `You are an AI assistant helping a student who is completely overwhelmed and is going to miss a deadline.
Task: "${task.text}" (Due: ${task.date}).
Generate a professional, polite, and concise email to a professor/manager asking for an extension.
Do NOT over-explain. Take accountability. Propose a specific new deadline (2 days from now).

Return ONLY raw JSON:
{
  "emailSubject": "Extension Request: [Assignment/Task Name]",
  "emailBody": "Dear [Name],\\n\\nI am writing to...\\n\\nSincerely,\\n[My Name]"
}`;

      try {
        const data = await callWithFallback(async (genAI, modelName) => {
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { temperature: 0.2, maxOutputTokens: 600 }
          });
          const result = await model.generateContent(prompt);
          return parseAIJson(result.response.text());
        });
        setDraft(`Subject: ${data.emailSubject}\n\n${data.emailBody}`);
      } catch (err) {
        toast.error("Failed to generate extension draft");
        onClose();
      } finally {
        setLoading(false);
      }
    };

    generateDraft();
  }, [task]);

  const handleCopy = () => {
    navigator.clipboard.writeText(draft);
    toast.success("Draft copied to clipboard!");
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        style={{
          background: 'rgba(20,10,15,0.95)', border: '1px solid rgba(168,85,247,0.5)',
          borderRadius: '24px', padding: '2rem', width: '90%', maxWidth: '500px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#a855f7' }}>
            <Mail size={24} />
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Draft Extension Request</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {loading ? (
           <div style={{ padding: '3rem 0', textAlign: 'center', color: '#9ca3af' }}>
           <div style={{ width: 40, height: 40, border: '3px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
           Drafting a professional email...
         </div>
        ) : draft ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.25rem', borderRadius: '12px', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.9rem', color: '#e5e7eb', maxHeight: '300px', overflowY: 'auto' }}>
              {draft}
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={handleCopy} className="btn-secondary" style={{ flex: 1, padding: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <Copy size={16} /> Copy to Clipboard
              </button>
              <button onClick={onClose} className="btn-primary" style={{ flex: 1, padding: '0.8rem', background: '#a855f7', color: '#fff' }}>
                Done
              </button>
            </div>
          </div>
        ) : null}
      </motion.div>
    </div>
  );
};
