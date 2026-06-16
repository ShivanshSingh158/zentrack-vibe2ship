import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Wrench, Video, Play, Loader2, Briefcase, Code, Brain } from 'lucide-react';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { fetchYouTubePlaylist, extractPlaylistId } from '../../services/youtube';
import { analyzeJobDescription, analyzeLeetCodeSlug } from '../../services/gemini';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

import type { User } from 'firebase/auth';
import { InterviewPrepModule } from './InterviewPrepModule';
import { SpotifyPlayer } from '../spotify/SpotifyPlayer';
import { GradeCalculatorModule } from '../academic/GradeCalculatorModule';

const uniqueId = () => crypto.randomUUID();

const sanitize = (obj: any) => JSON.parse(JSON.stringify(obj, (k, v) => v === undefined ? null : v));

interface ToolsHubModuleProps {
  user: User | null;
}

export const ToolsHubModule: React.FC<ToolsHubModuleProps> = ({ user }) => {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isImportingYt, setIsImportingYt] = useState(false);
  
  const [jobText, setJobText] = useState('');
  const [isAnalyzingJob, setIsAnalyzingJob] = useState(false);

  const [leetCodeUrl, setLeetCodeUrl] = useState('');
  const [isImportingLc, setIsImportingLc] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);

  // LeetCode result cache: slug -> { data, ts }
  const LC_CACHE_KEY = 'zen_lc_cache';
  const getLcCache = (slug: string) => {
    try {
      const raw = localStorage.getItem(LC_CACHE_KEY);
      if (!raw) return null;
      const cache = JSON.parse(raw);
      const entry = cache[slug];
      if (!entry) return null;
      // Cache valid for 24 hours
      if (Date.now() - entry.ts < 24 * 60 * 60 * 1000) return entry.data;
      return null;
    } catch { return null; }
  };
  const setLcCache = (slug: string, data: any) => {
    try {
      const raw = localStorage.getItem(LC_CACHE_KEY);
      const cache = raw ? JSON.parse(raw) : {};
      cache[slug] = { data, ts: Date.now() };
      localStorage.setItem(LC_CACHE_KEY, JSON.stringify(cache));
    } catch { /* ignore quota errors */ }
  };

  const navigate = useNavigate();

  const handleImportYoutube = async () => {
    if (!user) {
      toast.error('You must be logged in to do this.');
      return;
    }
    if (!youtubeUrl.trim()) {
      toast.error('Please enter a YouTube playlist URL.');
      return;
    }
    
    const playlistId = extractPlaylistId(youtubeUrl);
    if (!playlistId) {
      toast.error("Invalid YouTube Playlist URL. Ensure it has a 'list=' parameter.");
      return;
    }

    setIsImportingYt(true);
    try {
      const data = await fetchYouTubePlaylist(playlistId);
      
      // Check if already exists
      const q = query(collection(db, 'learning_topics'), where('userId', '==', user.uid), where('title', '==', data.title));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        toast.error(`Playlist "${data.title}" is already imported.`);
        setIsImportingYt(false);
        return;
      }

      const subTasks = data.videos.map((v: any) => ({
        id: uniqueId(),
        text: v.title,
        category: 'Videos',
        isCompleted: false,
        url: v.link,
        resources: [{ title: 'Watch Video', url: v.link, type: 'video' as const }]
      }));

      // Get count for ordering
      const countSnap = await getDocs(query(collection(db, 'learning_topics'), where('userId', '==', user.uid)));

      const newTopic = {
        userId: user.uid,
        title: data.title,
        subTasks,
        createdAt: Date.now(),
        lastStudiedAt: Date.now(),
        order: countSnap.size,
        timeSpentMs: 0
      };

      await addDoc(collection(db, 'learning_topics'), sanitize(newTopic));
      toast.success(`Successfully imported ${data.videos.length} videos from ${data.title}!`);
      setYoutubeUrl('');
      navigate('/learning');
    } catch (error: any) {
      toast.error(error.message || "Failed to fetch playlist");
    } finally {
      setIsImportingYt(false);
    }
  };

  const handleAnalyzeJob = async () => {
    if (!user) return toast.error('You must be logged in.');
    if (!jobText.trim()) return toast.error('Please paste a job description or URL.');

    setIsAnalyzingJob(true);

    let textToAnalyze = jobText.trim();

    // ── Auto-detect if user pasted a URL ──────────────────────────────────────
    const isUrl = /^https?:\/\//i.test(textToAnalyze);
    if (isUrl) {
      toast.info('🔗 Detected a URL — fetching job description...');
      try {
        const resp = await fetch('/api/fetch-job', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: textToAnalyze }),
        });
        const json = await resp.json();
        if (!resp.ok || !json.text) {
          toast.error(json.error || 'Could not fetch the URL. Please paste the job description text directly.');
          setIsAnalyzingJob(false);
          return;
        }
        textToAnalyze = json.text;
        toast.success('✅ Page fetched! Analyzing job description...');
      } catch {
        toast.error('Network error fetching URL. Please paste the job description text directly.');
        setIsAnalyzingJob(false);
        return;
      }
    }

    if (textToAnalyze.length < 50) {
      toast.error('Job description is too short. Please paste more content.');
      setIsAnalyzingJob(false);
      return;
    }

    try {
      const data = await analyzeJobDescription(textToAnalyze);

      // Validate extracted data — reject if critical fields are missing
      if (!data.company && !data.role) {
        toast.error('Could not extract Company Name or Job Title. Please paste the full job description text (not just a URL).');
        setIsAnalyzingJob(false);
        return;
      }

      // Use best-effort values if only one field is missing
      const company = data.company || 'Unknown Company';
      const role = data.role || 'Unknown Role';

      // 1. Create Job Application
      const newJob = {
        userId: user.uid,
        company,
        role,
        location: data.location || '',
        expectedSalary: data.salary || '',
        status: 'wishlist',
        dateApplied: new Date().toISOString().split('T')[0],
        notes: isUrl ? `Auto-imported from: ${jobText.trim()}` : 'Auto-imported via Zen AI Power Tools',
        createdAt: Date.now()
      };
      await addDoc(collection(db, 'job_applications'), sanitize(newJob));

      // 2. Create Learning Topic for Skills
      if (data.skills && data.skills.length > 0) {
        const countSnap = await getDocs(query(collection(db, 'learning_topics'), where('userId', '==', user.uid)));
        const subTasks = data.skills.map((skill: string) => ({
          id: uniqueId(),
          text: skill,
          isCompleted: false
        }));
        const newTopic = {
          userId: user.uid,
          title: `Job Prep: ${company} - ${role}`,
          subTasks,
          createdAt: Date.now(),
          lastStudiedAt: Date.now(),
          order: countSnap.size,
          timeSpentMs: 0
        };
        await addDoc(collection(db, 'learning_topics'), sanitize(newTopic));
      }

      const skillsMsg = data.skills.length > 0 ? ` · ${data.skills.length} skills added to Learning` : '';
      toast.success(`✅ ${company} · ${role}${skillsMsg}`);
      setJobText('');
      navigate('/jobs');
    } catch (error: any) {
      toast.error(error.message || 'Failed to analyze job description. Please try again.');
    } finally {
      setIsAnalyzingJob(false);
    }
  };
  const handleImportLeetCode = async (forceRefetch = false) => {
    if (!user) return toast.error('You must be logged in.');
    if (!leetCodeUrl.trim()) return toast.error('Please enter a LeetCode URL.');

    const match = leetCodeUrl.match(/leetcode\.com\/problems\/([^/]+)/);
    const slug = match ? match[1] : leetCodeUrl.trim().replace(/[^a-zA-Z0-9-]/g, '');

    // Check cache first
    if (!forceRefetch) {
      const cached = getLcCache(slug);
      if (cached) {
        toast.info(`Using cached data for "${cached.title}" (fetched within 24h)`);
        // Still save to Firestore
        try {
          const newProblem = {
            userId: user.uid, title: cached.title, difficulty: cached.difficulty,
            tags: cached.tags, optimalTimeComplexity: cached.optimalTimeComplexity,
            optimalSpaceComplexity: cached.optimalSpaceComplexity, pattern: cached.pattern,
            similarProblems: cached.similarProblems, hints: cached.hints,
            status: 'todo', createdAt: Date.now()
          };
          await addDoc(collection(db, 'mock_interviews'), sanitize(newProblem));
          toast.success(`Imported: ${cached.title}`);
          setLeetCodeUrl('');
        } catch (e: any) { toast.error(e.message); }
        return;
      }
    }

    setIsImportingLc(true);
    try {
      const data = await analyzeLeetCodeSlug(slug);
      setLcCache(slug, data); // Cache the result
      
      const newProblem = {
        userId: user.uid,
        title: data.title,
        difficulty: data.difficulty,
        tags: data.tags,
        optimalTimeComplexity: data.optimalTimeComplexity,
        optimalSpaceComplexity: data.optimalSpaceComplexity,
        pattern: data.pattern,
        similarProblems: data.similarProblems,
        hints: data.hints,
        status: 'todo',
        createdAt: Date.now()
      };

      await addDoc(collection(db, 'mock_interviews'), sanitize(newProblem));
      toast.success(`Imported LeetCode problem: ${data.title}`);
      setLeetCodeUrl('');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsImportingLc(false);
    }
  };

  return (
    <div className="learning-container" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="learning-header" style={{ flexShrink: 0, marginBottom: '1.5rem' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Wrench size={24} className="logo-icon" /> Power Tools
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Powerful integrations and automations to boost your workflow.
          </p>
        </div>
      </div>

      {/* ── Row 1: 3 Tool Cards ── */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '6rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '0.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>

          {/* YouTube Playlist Importer */}
          <div className="topic-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', flexShrink: 0 }}>
                <Video size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>YouTube Importer</h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Extract full playlists into the Learning module.</p>
              </div>
            </div>
            <input
              type="url"
              placeholder="Paste playlist URL (e.g. ?list=PL...)"
              value={youtubeUrl}
              onChange={e => setYoutubeUrl(e.target.value)}
              disabled={isImportingYt}
              style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' }}
            />
            <button className="btn-primary" onClick={handleImportYoutube} disabled={isImportingYt || !youtubeUrl.trim()} style={{ width: '100%', padding: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'linear-gradient(135deg,#ef4444,#f43f5e)', boxShadow: '0 4px 15px rgba(239,68,68,0.3)', marginTop: 'auto' }}>
              {isImportingYt ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
              {isImportingYt ? 'Importing...' : 'Import to Learning Module'}
            </button>
          </div>

          {/* Job Description Analyzer */}
          <div className="topic-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', flexShrink: 0 }}>
                <Briefcase size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Job Analyzer (AI)</h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Extracts role, company, salary &amp; skills from text or URL.</p>
              </div>
            </div>
            <textarea
              placeholder="Paste the full Job Description text here, or paste a job posting URL..."
              value={jobText}
              onChange={e => setJobText(e.target.value)}
              disabled={isAnalyzingJob}
              style={{ width: '100%', minHeight: '100px', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.88rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <button className="btn-primary" onClick={handleAnalyzeJob} disabled={isAnalyzingJob || !jobText.trim()} style={{ width: '100%', padding: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'linear-gradient(135deg,#3b82f6,#60a5fa)', boxShadow: '0 4px 15px rgba(59,130,246,0.3)', marginTop: 'auto' }}>
              {isAnalyzingJob ? <Loader2 size={18} className="animate-spin" /> : <Briefcase size={18} />}
              {isAnalyzingJob ? 'Analyzing...' : 'Analyze & Create Job Card'}
            </button>
          </div>

          {/* LeetCode Mock Interview */}
          <div className="topic-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b', flexShrink: 0 }}>
                <Code size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>LeetCode Mock Interview</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Paste a LeetCode problem URL. AI will extract details and generate a mock interview.
            </p>  </div>
            </div>
            <input
              type="url"
              placeholder="Paste LeetCode problem URL..."
              value={leetCodeUrl}
              onChange={e => setLeetCodeUrl(e.target.value)}
              disabled={isImportingLc}
              style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: 'auto' }}>
              <button className="btn-primary" onClick={() => handleImportLeetCode()} disabled={isImportingLc || !leetCodeUrl.trim()} style={{ flex: 1, padding: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'linear-gradient(135deg,#f59e0b,#fbbf24)', boxShadow: '0 4px 15px rgba(245,158,11,0.3)', color: '#000' }}>
                {isImportingLc ? <Loader2 size={18} className="animate-spin" /> : <Code size={18} />}
                {isImportingLc ? 'Importing...' : 'Import'}
              </button>
              <button className="btn-secondary" onClick={() => setShowSimulator(true)} style={{ flex: 1, padding: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', borderColor: '#f59e0b', color: '#f59e0b' }}>
                <Brain size={18} /> Simulator
              </button>
            </div>
          </div>
        </div>

        {/* ── Row 2: Spotify Player (full width) ── */}
        <div style={{ display: typeof window !== 'undefined' && window.innerWidth <= 600 ? 'none' : 'block' }}>
          <SpotifyPlayer />
        </div>

        {/* ── Row 3: GPA Calculator ── */}
        <div style={{ padding: '1.5rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', marginTop: '0.5rem' }}>
          <GradeCalculatorModule />
        </div>

      </div>

      {showSimulator && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'var(--bg-base)', display: 'flex', flexDirection: 'column' }}>
          <InterviewPrepModule onClose={() => setShowSimulator(false)} />
        </div>,
        document.body
      )}
    </div>
  );
};

