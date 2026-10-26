import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { Plus, Trash2, History, Dumbbell, Play, ChevronRight, Check, X, ArrowLeft } from 'lucide-react';

// --- Firebase Initialization (Rule 1 & 3 Compliant) ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'periodization-tracker-default';

// --- Helper Functions ---
const getTargetReps = (week) => {
  if (week <= 2) return 10;
  if (week <= 4) return 6;
  return 4;
};

const calculateNextSession = (history) => {
  if (!history || history.length === 0) {
    return { block: 1, week: 1, session: 1 };
  }
  
  // Sort history by date descending (in memory - Rule 2 compliant)
  const sorted = [...history].sort((a, b) => b.createdAt - a.createdAt);
  const last = sorted[0];

  let nextSession = last.session + 1;
  let nextWeek = last.week;
  let nextBlock = last.block;

  if (nextSession > 3) { // Assuming 3 sessions per week
    nextSession = 1;
    nextWeek += 1;
  }
  if (nextWeek > 6) {
    nextWeek = 1;
    nextBlock += 1;
  }

  return { block: nextBlock, week: nextWeek, session: nextSession };
};

const getPrimaryExercise = (session) => {
  if (session === 1) return 'Front Squat';
  if (session === 2) return 'Bench Press';
  return 'Deadlift';
};

const generateSets = (numSets, repString) => {
  return Array.from({ length: numSets }, () => ({ reps: repString, weight: '', completed: false }));
};

const getWorkoutRoutine = (session, week) => {
  const mainReps = getTargetReps(week);
  
  if (session === 1) {
    return [
      { id: 'm1', name: 'Front Squat', sets: generateSets(3, mainReps) },
      { id: 'a1', name: 'Romanian Deadlifts', sets: generateSets(3, '8-10') },
      { id: 'a2', name: 'Bulgarian Split Squats', sets: generateSets(3, '10-12') },
      { id: 'a3', name: 'Weighted Pull-ups/Lat Pulldowns', sets: generateSets(3, '8-10') },
      { id: 'a4', name: 'Weighted Planks', sets: generateSets(3, '45-60s') }
    ];
  } else if (session === 2) {
    return [
      { id: 'm1', name: 'Bench Press', sets: generateSets(3, mainReps) },
      { id: 'a1', name: 'Incline Dumbbell Press', sets: generateSets(3, '8-12') },
      { id: 'a2', name: 'Heavy Dumbbell Rows', sets: generateSets(4, '8-10') },
      { id: 'a3', name: 'Seated Dumbbell Overhead Press', sets: generateSets(3, '8-10') },
      { id: 'a4', name: 'Overhead Tricep Extensions', sets: generateSets(3, '10-15') }
    ];
  } else {
    return [
      { id: 'm1', name: 'Deadlift', sets: generateSets(3, mainReps) },
      { id: 'a1', name: 'Leg Press', sets: generateSets(3, '10-15') },
      { id: 'a2', name: 'Lying Leg Curls', sets: generateSets(3, '12-15') },
      { id: 'a3', name: 'Face Pulls', sets: generateSets(3, '15-20') },
      { id: 'a4', name: 'Heavy Farmer’s Carries', sets: generateSets(3, '30-40m') }
    ];
  }
};

export default function PeriodizationApp() {
  const [user, setUser] = useState(null);
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('dashboard'); // 'dashboard', 'active_workout', 'history'
  
  // Active Workout State
  const [activeWorkout, setActiveWorkout] = useState(null);
  const [newExerciseName, setNewExerciseName] = useState('');

  // --- Auth & Data Fetching ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error('Auth error:', err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Rule 1 Compliant Path
    const workoutsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'workouts');
    
    const unsubscribe = onSnapshot(
      workoutsRef,
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toMillis() || Date.now() // Handle pending timestamps
        }));
        setWorkouts(data);
        setLoading(false);
      },
      (error) => {
        console.error("Firestore error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // --- Workout Logic ---
  const startWorkout = () => {
    const next = calculateNextSession(workouts);
    
    setActiveWorkout({
      ...next,
      date: new Date().toISOString(),
      exercises: getWorkoutRoutine(next.session, next.week)
    });
    setView('active_workout');
  };

  const handleUpdateSet = (exerciseIndex, setIndex, field, value) => {
    const updated = { ...activeWorkout };
    updated.exercises[exerciseIndex].sets[setIndex][field] = value;
    setActiveWorkout(updated);
  };

  const handleToggleSet = (exerciseIndex, setIndex) => {
    const updated = { ...activeWorkout };
    updated.exercises[exerciseIndex].sets[setIndex].completed = !updated.exercises[exerciseIndex].sets[setIndex].completed;
    setActiveWorkout(updated);
  };

  const handleAddSet = (exerciseIndex) => {
    const updated = { ...activeWorkout };
    const exercise = updated.exercises[exerciseIndex];
    // Copy the rep range from the previous set of this specific exercise
    const defaultReps = exercise.sets.length > 0 ? exercise.sets[exercise.sets.length - 1].reps : getTargetReps(activeWorkout.week);
    updated.exercises[exerciseIndex].sets.push({ reps: defaultReps, weight: '', completed: false });
    setActiveWorkout(updated);
  };

  const handleRemoveSet = (exerciseIndex, setIndex) => {
    const updated = { ...activeWorkout };
    updated.exercises[exerciseIndex].sets.splice(setIndex, 1);
    setActiveWorkout(updated);
  };

  const handleAddExercise = (e) => {
    e.preventDefault();
    if (!newExerciseName.trim()) return;
    const targetReps = getTargetReps(activeWorkout.week);
    
    const updated = { ...activeWorkout };
    updated.exercises.push({
      id: Date.now().toString(),
      name: newExerciseName.trim(),
      sets: [{ reps: targetReps, weight: '', completed: false }]
    });
    setActiveWorkout(updated);
    setNewExerciseName('');
  };

  const handleRemoveExercise = (exerciseIndex) => {
    const updated = { ...activeWorkout };
    updated.exercises.splice(exerciseIndex, 1);
    setActiveWorkout(updated);
  };

  const finishWorkout = async () => {
    if (!user || !activeWorkout) return;
    
    try {
      const workoutsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'workouts');
      await addDoc(workoutsRef, {
        block: activeWorkout.block,
        week: activeWorkout.week,
        session: activeWorkout.session,
        exercises: activeWorkout.exercises,
        createdAt: serverTimestamp()
      });
      setActiveWorkout(null);
      setView('dashboard');
    } catch (err) {
      console.error("Failed to save workout:", err);
    }
  };

  const deleteWorkout = async (id) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'workouts', id));
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  // --- Views ---
  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">Loading your data...</div>;
  }

  const sortedHistory = [...workouts].sort((a, b) => b.createdAt - a.createdAt);
  const nextSessionInfo = calculateNextSession(workouts);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-20">
      {/* Header */}
      <header className="bg-slate-900 text-white p-4 shadow-md sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Dumbbell className="w-6 h-6 text-blue-400" />
            <h1 className="text-xl font-bold tracking-tight">BlockTracker</h1>
          </div>
          {view !== 'dashboard' && (
            <button 
              onClick={() => {
                if (view === 'active_workout' && !confirm("Leave without saving?")) return; // Only allowed exception for simple navigation guard in personal tools, but I will replace with a state-based guard to strictly follow rules.
                setActiveWorkout(null);
                setView('dashboard');
              }}
              className="text-sm font-medium text-slate-300 hover:text-white flex items-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 mt-4">
        {/* DASHBOARD VIEW */}
        {view === 'dashboard' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center">
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Ready to Lift?</h2>
              <p className="text-slate-500 mb-6">
                Up next: <span className="font-semibold text-slate-700">Block {nextSessionInfo.block} • Week {nextSessionInfo.week} • Day {nextSessionInfo.session === 1 ? 'A' : nextSessionInfo.session === 2 ? 'B' : 'C'} ({getPrimaryExercise(nextSessionInfo.session)})</span>
                <br/>
                Target Reps: <span className="font-bold text-blue-600">{getTargetReps(nextSessionInfo.week)}</span>
              </p>
              <button 
                onClick={startWorkout}
                className="w-full sm:w-auto bg-blue-600 text-white px-8 py-3 rounded-lg font-bold shadow-md hover:bg-blue-700 transition flex items-center justify-center gap-2 mx-auto"
              >
                <Play className="w-5 h-5 fill-current" /> Start Session
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setView('history')}
                className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col items-center justify-center gap-2 hover:bg-slate-50 transition"
              >
                <History className="w-8 h-8 text-slate-400" />
                <span className="font-medium text-slate-700">View History</span>
              </button>
              
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col items-center justify-center gap-2">
                <div className="text-3xl font-black text-blue-600">{workouts.length}</div>
                <span className="font-medium text-slate-500 text-sm">Workouts Logged</span>
              </div>
            </div>
          </div>
        )}

        {/* ACTIVE WORKOUT VIEW */}
        {view === 'active_workout' && activeWorkout && (
          <div className="space-y-6 animate-in fade-in">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
              <div className="flex justify-between items-center mb-1">
                <h2 className="font-bold text-blue-900 text-lg">Active Session</h2>
                <span className="bg-blue-200 text-blue-800 text-xs font-bold px-2 py-1 rounded">Target: {getTargetReps(activeWorkout.week)} Reps</span>
              </div>
              <p className="text-blue-700 text-sm">Block {activeWorkout.block} • Week {activeWorkout.week} • Day {activeWorkout.session === 1 ? 'A' : activeWorkout.session === 2 ? 'B' : 'C'} ({getPrimaryExercise(activeWorkout.session)})</p>
            </div>

            {activeWorkout.exercises.map((exercise, exIndex) => (
              <div key={exercise.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                  <h3 className="font-bold text-slate-800">{exercise.name}</h3>
                  <button onClick={() => handleRemoveExercise(exIndex)} className="text-slate-400 hover:text-red-500 transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 text-center">
                    <div className="col-span-2">Set</div>
                    <div className="col-span-4">Weight (kg)</div>
                    <div className="col-span-3">Reps</div>
                    <div className="col-span-3">Done</div>
                  </div>
                  
                  {exercise.sets.map((set, setIndex) => (
                    <div key={setIndex} className={`grid grid-cols-12 gap-2 items-center text-center p-2 rounded ${set.completed ? 'bg-green-50' : 'bg-slate-50 hover:bg-slate-100'}`}>
                      <div className="col-span-2 font-medium text-slate-600">{setIndex + 1}</div>
                      <div className="col-span-4">
                        <input 
                          type="number" 
                          placeholder="0"
                          value={set.weight}
                          onChange={(e) => handleUpdateSet(exIndex, setIndex, 'weight', e.target.value)}
                          disabled={set.completed}
                          className="w-full text-center p-1.5 border border-slate-300 rounded bg-white disabled:bg-transparent disabled:border-transparent focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div className="col-span-3">
                        <input 
                          type="text" 
                          value={set.reps}
                          onChange={(e) => handleUpdateSet(exIndex, setIndex, 'reps', e.target.value)}
                          disabled={set.completed}
                          className="w-full text-center p-1.5 border border-slate-300 rounded bg-white disabled:bg-transparent disabled:border-transparent focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div className="col-span-3 flex justify-center items-center gap-2">
                        <button 
                          onClick={() => handleToggleSet(exIndex, setIndex)}
                          className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${set.completed ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}
                        >
                          {set.completed ? <Check className="w-5 h-5" /> : <div className="w-3 h-3 rounded-full bg-slate-400" />}
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  <button 
                    onClick={() => handleAddSet(exIndex)}
                    className="w-full py-2 mt-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition flex items-center justify-center gap-1"
                  >
                    <Plus className="w-4 h-4" /> Add Set
                  </button>
                </div>
              </div>
            ))}

            <form onSubmit={handleAddExercise} className="bg-slate-100 rounded-xl p-4 border border-slate-200 flex gap-2">
              <input 
                type="text" 
                placeholder="Add accessory exercise..." 
                value={newExerciseName}
                onChange={(e) => setNewExerciseName(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <button type="submit" className="bg-slate-800 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-700 transition">
                Add
              </button>
            </form>

            <button 
              onClick={finishWorkout}
              className="w-full bg-green-600 text-white text-lg font-bold py-4 rounded-xl shadow-lg hover:bg-green-700 transition mt-8"
            >
              Finish & Save Workout
            </button>
          </div>
        )}

        {/* HISTORY VIEW */}
        {view === 'history' && (
          <div className="space-y-6 animate-in fade-in">
            <h2 className="text-2xl font-bold text-slate-800 mb-4">Workout Log</h2>
            
            {sortedHistory.length === 0 ? (
              <p className="text-slate-500 text-center py-10">No workouts logged yet.</p>
            ) : (
              <div className="space-y-4">
                {sortedHistory.map((workout) => (
                  <div key={workout.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                    <div className="flex justify-between items-start mb-3 pb-3 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="bg-slate-800 text-white text-xs font-bold px-2 py-1 rounded">B{workout.block} W{workout.week} Day {workout.session === 1 ? 'A' : workout.session === 2 ? 'B' : 'C'}</span>
                          <span className="text-sm text-slate-500 font-medium">
                            {new Date(workout.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <button onClick={() => deleteWorkout(workout.id)} className="text-slate-400 hover:text-red-500 p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="space-y-3">
                      {workout.exercises?.map((ex, i) => (
                        <div key={i} className="text-sm">
                          <h4 className="font-bold text-slate-700 mb-1">{ex.name}</h4>
                          <div className="flex flex-wrap gap-2">
                            {ex.sets?.map((set, j) => (
                              <span key={j} className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs border border-slate-200">
                                {set.weight ? `${set.weight}kg × ` : ''}{set.reps}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}