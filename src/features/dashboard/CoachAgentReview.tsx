import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Trophy, Target, Activity } from 'lucide-react';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { generateAnalyticsInsights } from '../../services/gemini';

export const CoachAgentReview = () => {
  const { tasks, dailyLogs, habits, goals, jobs, gymLogs } = useGlobalData();
  const [review, setReview] = useState<{ insights: string[], recommendations: any[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const runCoach = async () => {
    setLoading(true);
    try {
      const result = await generateAnalyticsInsights({
        tasks, logs: dailyLogs, habits, goals, jobs, gym: gymLogs
      });
      setReview(result);
      setHasRun(true);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  if (!hasRun && !loading) {
    return (
      <div 
        style={{ background: 'rgba(52, 211, 153, 0.1)', border: '1px solid rgba(52, 211, 153, 0.3)', borderRadius: '16px', padding: '1.5rem', marginTop: '2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        onClick={runCoach}
      >
        <div>
          <h3 style={{ color: '#34d399', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={20} /> AI Coach Weekly Review
          </h3>
          <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0, fontSize: '0.9rem' }}>Generate your personalized productivity breakdown based on your data.</p>
        </div>
        <button style={{ background: '#34d399', color: '#000', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
          Generate
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ background: 'rgba(52, 211, 153, 0.05)', border: '1px solid rgba(52, 211, 153, 0.2)', borderRadius: '16px', padding: '2rem', marginTop: '2rem', textAlign: 'center' }}>
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }} style={{ display: 'inline-block', color: '#34d399', marginBottom: '1rem' }}>
          <Sparkles size={32} />
        </motion.div>
        <div style={{ color: '#34d399' }}>Coach Agent is analyzing your patterns...</div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      style={{ background: 'rgba(52, 211, 153, 0.1)', border: '1px solid rgba(52, 211, 153, 0.4)', borderRadius: '16px', padding: '1.5rem', marginTop: '2rem' }}
    >
      <h3 style={{ color: '#34d399', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.2rem' }}>
        <Activity size={24} /> Coach Agent Review
      </h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <div>
          <h4 style={{ color: '#fff', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Trophy size={18} color="#fcd34d" /> Key Insights
          </h4>
          <ul style={{ paddingLeft: '1.2rem', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', lineHeight: 1.6 }}>
            {review?.insights?.map((insight, i) => (
              <li key={i} style={{ marginBottom: '0.5rem' }}>{insight}</li>
            ))}
          </ul>
        </div>
        
        <div>
          <h4 style={{ color: '#fff', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Target size={18} color="#60a5fa" /> Recommended Actions
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {review?.recommendations?.map((rec, i) => (
              <div key={i} style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', borderLeft: '3px solid #60a5fa' }}>
                <div style={{ fontWeight: 'bold', color: '#fff', marginBottom: '0.3rem' }}>{rec.title}</div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>{rec.description}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
