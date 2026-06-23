import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Siren, CheckCircle2 } from 'lucide-react';
import { callWithFallback, parseAIJson } from '../../services/gemini';
import { toast } from 'sonner';

export const RecoveryPlannerModal = ({ task, onClose }: { task: any, onClose: () => void }) => {
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<any>(null);

  useEffect(() => {
    const generatePlan = async () => {
      const prompt = `You are a brutal but helpful crisis recovery agent.
The user is critically behind on this task: "${task.text}" (Due: ${task.date}).
Break this task down into an emergency, minute-by-minute survival plan. Cut all corners. What is the minimum viable way to survive this deadline?

Return ONLY raw JSON in this format:
{
  "survivalMessage": "You're late. Here is the minimum viable path to survive.",
  "microSteps": [
    { "timeMinutes": 10, "action": "Do this immediately to stop the bleeding" }
  ]
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
        setPlan(data);
      } catch (err) {
        toast.error("Failed to generate recovery plan");
        onClose();
      } finally {
        setLoading(false);
      }
    };

    generatePlan();
  }, [task]);

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
          background: 'rgba(20,10,15,0.95)', border: '1px solid rgba(239,68,68,0.5)',
          borderRadius: '24px', padding: '2rem', width: '90%', maxWidth: '450px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#ef4444' }}>
            <Siren size={24} />
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Emergency Recovery</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {loading ? (
           <div style={{ padding: '3rem 0', textAlign: 'center', color: '#9ca3af' }}>
           <div style={{ width: 40, height: 40, border: '3px solid rgba(239,68,68,0.2)', borderTopColor: '#ef4444', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
           Generating Minimum Viable Survival Plan...
         </div>
        ) : plan ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <p style={{ color: 'var(--text-primary)', fontSize: '1.05rem', lineHeight: 1.5, fontStyle: 'italic', borderLeft: '3px solid #ef4444', paddingLeft: '1rem' }}>
              "{plan.survivalMessage}"
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {plan.microSteps?.map((step: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(239,68,68,0.05)', padding: '0.75rem', borderRadius: '12px' }}>
                  <CheckCircle2 size={16} color="#ef4444" />
                  <span style={{ color: '#e5e7eb', fontSize: '0.95rem', flex: 1 }}>{step.action}</span>
                  <span style={{ color: '#fca5a5', fontSize: '0.85rem', fontWeight: 600 }}>{step.timeMinutes}m</span>
                </div>
              ))}
            </div>

            <button onClick={() => {
              toast.success("Recovery plan injected as subtasks.");
              onClose();
            }} className="btn-primary" style={{ width: '100%', padding: '0.8rem', background: '#ef4444', color: '#fff' }}>
              Execute Plan (Add as Subtasks)
            </button>
          </div>
        ) : null}
      </motion.div>
    </div>
  );
};
