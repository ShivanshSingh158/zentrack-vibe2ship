import { db, auth } from '../services/firebase';
import { collection, writeBatch, doc } from 'firebase/firestore';

export const seedDemoData = async () => {
  if (!auth.currentUser) return;
  const uid = auth.currentUser.uid;
  
  if (localStorage.getItem('zentrack_demo_seeded_' + uid)) {
    console.log('[Seed] Demo data already seeded for this user.');
    return;
  }

  console.log('[Seed] Seeding demo data...');
  const batch = writeBatch(db);
  const now = new Date();
  
  // 1. Tasks
  const tasksRef = collection(db, 'tasks');
  const tasks = [
    { title: 'Finish DB Schema', priority: 'high', date: new Date(now.getTime() - 2 * 3600000).toISOString(), status: 'pending' }, // Overdue
    { title: 'Submit React Project', priority: 'high', date: new Date(now.getTime() + 4 * 3600000).toISOString(), status: 'pending' }, // Critical
    { title: 'Review PRs', priority: 'medium', date: new Date(now.getTime() + 12 * 3600000).toISOString(), status: 'pending' }, // Urgent
    { title: 'Buy Groceries', priority: 'low', date: new Date(now.getTime() + 48 * 3600000).toISOString(), status: 'pending' } // Upcoming
  ];
  tasks.forEach(t => {
    const newDoc = doc(tasksRef);
    batch.set(newDoc, { ...t, createdAt: now.getTime(), userId: uid });
  });

  // 2. Jobs
  const jobsRef = collection(db, 'users', uid, 'jobs');
  const jobs = [
    { role: 'Frontend Engineer', company: 'Google', status: 'interviewing', appliedDate: now.toISOString() },
    { role: 'Software Engineer', company: 'Meta', status: 'applied', appliedDate: now.toISOString() },
    { role: 'Full Stack Dev', company: 'Stripe', status: 'offer', appliedDate: now.toISOString() },
    { role: 'Backend Engineer', company: 'Netflix', status: 'rejected', appliedDate: now.toISOString() }
  ];
  jobs.forEach(j => {
    const newDoc = doc(jobsRef);
    batch.set(newDoc, { ...j, createdAt: now.getTime(), userId: uid });
  });

  // 3. Habits
  const habitsRef = collection(db, 'users', uid, 'habits');
  const habits = [
    { name: 'Morning Run', type: 'good', streak: 12 },
    { name: 'Read 10 pages', type: 'good', streak: 5 },
    { name: 'Doomscrolling', type: 'bad', streak: 0 }
  ];
  habits.forEach(h => {
    const newDoc = doc(habitsRef);
    batch.set(newDoc, { ...h, createdAt: now.getTime(), userId: uid, completions: {} });
  });

  // Execute batch
  try {
    await batch.commit();
    localStorage.setItem('zentrack_demo_seeded_' + uid, 'true');
    console.log('[Seed] Demo data successfully seeded!');
    window.location.reload(); // Reload to show data
  } catch (e) {
    console.error('[Seed] Error seeding data:', e);
  }
};
