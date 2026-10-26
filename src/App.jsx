import { useState } from 'react';

const WORKOUT_PLAN = {
  A: {
    title: 'Day A (Front Squat Focus)',
    mainLift: 'Front Squat',
    accessories: [
      { name: 'Romanian Deadlifts (RDLs)', target: '3 sets x 8-10 reps' },
      { name: 'Bulgarian Split Squats', target: '3 sets x 10-12 reps per leg' },
      { name: 'Weighted Pull-ups / Lat Pulldowns', target: '3 sets x 8-10 reps' },
      { name: 'Weighted Planks', target: '3 sets x 45-60 seconds' },
    ],
  },
  B: {
    title: 'Day B (Bench Press Focus)',
    mainLift: 'Bench Press',
    accessories: [
      { name: 'Incline Dumbbell Press', target: '3 sets x 8-12 reps' },
      { name: 'Heavy Dumbbell Rows', target: '4 sets x 8-10 reps' },
      { name: 'Seated Dumbbell Overhead Press', target: '3 sets x 8-10 reps' },
      { name: 'Overhead Tricep Extensions', target: '3 sets x 10-15 reps' },
    ],
  },
  C: {
    title: 'Day C (Deadlift Focus)',
    mainLift: 'Deadlift',
    accessories: [
      { name: 'Leg Press', target: '3 sets x 10-15 reps' },
      { name: 'Lying Leg Curls', target: '3 sets x 12-15 reps' },
      { name: 'Face Pulls', target: '3 sets x 15-20 reps' },
      { name: 'Heavy Farmer’s Carries', target: '3 sets x 30-40 meters' },
    ],
  },
};

export default function App() {
  const [week, setWeek] = useState(1);
  const [currentDay, setCurrentDay] = useState('A');

  const getTargetReps = (currentWeek) => {
    if (currentWeek <= 2) return 10;
    if (currentWeek <= 4) return 6;
    return 4;
  };

  const advanceSession = () => {
    if (currentDay === 'A') {
      setCurrentDay('B');
    } else if (currentDay === 'B') {
      setCurrentDay('C');
    } else {
      setCurrentDay('A');
      setWeek((prev) => (prev === 6 ? 1 : prev + 1));
    }
  };

  const plan = WORKOUT_PLAN[currentDay];
  const targetReps = getTargetReps(week);

  return (
    <div className="container">
      <header>
        <h1>HevyLift Tracker</h1>
        <div className="status-bar">
          <span className="badge">Week {week} / 6</span>
          <span className="badge">Phase: {targetReps} Reps</span>
        </div>
      </header>

      <main>
        <h2>{plan.title}</h2>

        <div className="card main-lift">
          <h3>Primary Lift</h3>
          <div className="exercise-row">
            <span className="exercise-name">{plan.mainLift}</span>
            <span className="target-reps">Target: {targetReps} Reps</span>
            <input type="text" placeholder="Log weight (e.g., 100kg)" />
          </div>
        </div>

        <div className="card accessories">
          <h3>Complementary Exercises</h3>
          {plan.accessories.map((acc, idx) => (
            <div key={idx} className="exercise-row">
              <span className="exercise-name">{acc.name}</span>
              <span className="target-reps">{acc.target}</span>
              <input type="text" placeholder="Log weight/notes" />
            </div>
          ))}
        </div>

        <button className="complete-btn" onClick={advanceSession}>
          Complete Session & Advance
        </button>
      </main>
    </div>
  );
}
