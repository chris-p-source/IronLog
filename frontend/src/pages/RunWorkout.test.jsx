import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { WorkoutProvider } from '../context/WorkoutContext';
import RunWorkout from './RunWorkout';
import api from '../api';

vi.mock('../api', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const START = new Date('2026-08-17T10:00:00Z');

const session = { id: 1, template_name: 'Push Day', started_at: START.toISOString() };
const exercises = [{
  id: 10,
  exercise_name: 'Bench Press',
  exercise_type: 'strength',
  sets_planned: 3,
  reps_planned: 5,
  rest_seconds: 120,
  base_weight_kg: 60,
}];

function renderWorkout() {
  return render(
    <WorkoutProvider>
      <MemoryRouter initialEntries={[{ pathname: '/workout/1', state: { session, exercises } }]}>
        <Routes>
          <Route path="/workout/:sessionId" element={<RunWorkout />} />
        </Routes>
      </MemoryRouter>
    </WorkoutProvider>
  );
}

// Let queued promises (the log-set POST and friends) settle.
const flush = () => act(async () => { await Promise.resolve(); });

const advance = (ms) => act(async () => { vi.advanceTimersByTime(ms); });

const restValue = (c) => c.querySelector('.rest-timer-value')?.textContent ?? null;
const completeSet = async (c, i) => {
  fireEvent.click(c.querySelectorAll('.set-done-btn')[i]);
  await flush();
};

describe('RunWorkout rest timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    api.get.mockResolvedValue({ data: null });
    api.post.mockResolvedValue({ data: {} });
    api.delete.mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('counts down from the exercise rest period when a set is completed', async () => {
    const { container } = renderWorkout();
    await flush();

    expect(restValue(container)).toBeNull();

    await completeSet(container, 0);
    expect(restValue(container)).toBe('02:00');

    await advance(5000);
    expect(restValue(container)).toBe('01:55');
  });

  // Regression: starting a rest while one was already running used to clear the
  // live interval without arming a new one, freezing the countdown.
  it('restarts the countdown when another set is completed mid-rest', async () => {
    const { container } = renderWorkout();
    await flush();

    await completeSet(container, 0);
    await advance(5000);
    expect(restValue(container)).toBe('01:55');

    await completeSet(container, 1);
    expect(restValue(container)).toBe('02:00');

    await advance(5000);
    expect(restValue(container)).toBe('01:55');

    await advance(10000);
    expect(restValue(container)).toBe('01:45');
  });

  it('still dismisses itself at zero after a mid-rest restart', async () => {
    const { container } = renderWorkout();
    await flush();

    await completeSet(container, 0);
    await advance(3000);
    await completeSet(container, 1);

    // The restarted period runs its own full 120s, not the remainder of the first.
    await advance(119000);
    expect(restValue(container)).toBe('00:01');

    await advance(1000);
    expect(restValue(container)).toBeNull();
    expect(container.querySelector('.rest-banner')).toBeNull();
  });

  it('keeps ticking in the minimised banner after a restart', async () => {
    const { container } = renderWorkout();
    await flush();

    await completeSet(container, 0);
    fireEvent.click(container.querySelector('.rest-timer-overlay'));
    expect(container.querySelector('.rest-banner-time').textContent).toBe('02:00');

    await advance(4000);
    expect(container.querySelector('.rest-banner-time').textContent).toBe('01:56');

    // A new set re-expands the overlay, and that countdown runs too.
    await completeSet(container, 1);
    expect(restValue(container)).toBe('02:00');
    await advance(4000);
    expect(restValue(container)).toBe('01:56');
  });

  it('skipping rest clears the countdown and cancels the queued notification', async () => {
    const { container } = renderWorkout();
    await flush();

    await completeSet(container, 0);
    fireEvent.click(container.querySelector('.rest-timer-skip-btn'));
    await flush();

    expect(restValue(container)).toBeNull();

    // Nothing left running that could resurrect the overlay.
    await advance(120000);
    expect(restValue(container)).toBeNull();
  });

  it('recalculates the countdown after the tab was backgrounded', async () => {
    const { container } = renderWorkout();
    await flush();

    await completeSet(container, 0);

    // Simulate a locked screen: clock moves, throttled interval does not fire.
    await act(async () => {
      vi.setSystemTime(new Date(START.getTime() + 40000));
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(restValue(container)).toBe('01:20');
  });

  it('logs a completed set and un-logs it when the set is un-ticked', async () => {
    const { container } = renderWorkout();
    await flush();

    await completeSet(container, 0);
    expect(api.post).toHaveBeenCalledWith('/workouts/1/log-set', expect.objectContaining({
      session_exercise_id: 10,
      set_number: 1,
    }));

    await completeSet(container, 0);
    expect(api.post).toHaveBeenCalledWith('/workouts/1/unlog-set', {
      session_exercise_id: 10,
      set_number: 1,
    });
  });
});

// Resuming re-mounts the page with no router state — the banner only carries a
// session id — so everything on screen has to be rebuilt from the server and
// the local draft. Regression: it used to be rebuilt from the plan instead, so
// a session in progress came back looking untouched.
describe('RunWorkout resuming a session in progress', () => {
  const setRow = (c, i) => c.querySelectorAll('.set-row')[i];
  const cell = (c, i) => {
    const row = setRow(c, i);
    const inputs = row.querySelectorAll('.set-input');
    return {
      reps: inputs[0].value,
      weight: inputs[1].value,
      done: row.classList.contains('set-done'),
    };
  };

  // No router state, exactly as the resume banner navigates.
  function resumeWorkout() {
    return render(
      <WorkoutProvider>
        <MemoryRouter initialEntries={['/workout/1']}>
          <Routes>
            <Route path="/workout/:sessionId" element={<RunWorkout />} />
          </Routes>
        </MemoryRouter>
      </WorkoutProvider>
    );
  }

  const settle = () => act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });

  const withLogged = (sets) => [{ ...exercises[0], sets }];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    api.post.mockResolvedValue({ data: {} });
    api.delete.mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
    localStorage.clear();
  });

  const mockFetch = (sets, lastSession = null) => {
    api.get.mockImplementation((url) => {
      if (url === '/workouts/1') {
        return Promise.resolve({ data: { session, exercises: withLogged(sets) } });
      }
      if (url.startsWith('/progress/last-session/')) return Promise.resolve({ data: lastSession });
      return Promise.resolve({ data: null });
    });
  };

  it('brings back the sets already logged, with the weights actually lifted', async () => {
    mockFetch([
      { set_number: 1, reps_completed: 8, weight_kg: '77.50' },
      { set_number: 2, reps_completed: 7, weight_kg: '82.50' },
    ]);
    const { container } = resumeWorkout();
    await settle();

    expect(cell(container, 0)).toEqual({ reps: '8', weight: '77.5', done: true });
    expect(cell(container, 1)).toEqual({ reps: '7', weight: '82.5', done: true });
    // The set that was never done still offers the plan.
    expect(cell(container, 2)).toEqual({ reps: '5', weight: '60', done: false });
  });

  it('counts the restored sets towards progress', async () => {
    mockFetch([
      { set_number: 1, reps_completed: 8, weight_kg: '77.50' },
      { set_number: 2, reps_completed: 7, weight_kg: '82.50' },
    ]);
    const { container } = resumeWorkout();
    await settle();

    expect(container.querySelector('.workout-progress-text').textContent).toBe('2/3');
  });

  // The "last session" suggestion must never rewrite a set that is already done.
  it('does not let last-session weights overwrite what was lifted today', async () => {
    mockFetch(
      [{ set_number: 1, reps_completed: 8, weight_kg: '77.50' }],
      { completed_at: START.toISOString(), sets: [{ set_number: 1, reps_completed: 5, weight_kg: '60.00' }] }
    );
    const { container } = resumeWorkout();
    await settle();

    expect(cell(container, 0)).toEqual({ reps: '8', weight: '77.5', done: true });
  });

  it('keeps numbers typed into a set that was never ticked', async () => {
    localStorage.setItem('ironlog_workout_draft_1', JSON.stringify({
      sets: { 10: { 3: { reps: '3', weight: '95', done: false, touched: true } } },
      cardio: {},
    }));
    mockFetch([{ set_number: 1, reps_completed: 8, weight_kg: '77.50' }]);
    const { container } = resumeWorkout();
    await settle();

    expect(cell(container, 2)).toEqual({ reps: '3', weight: '95', done: false });
  });

  // A stale draft must never resurrect a set the user un-ticked: the server is
  // the authority on what counts as done.
  it('leaves an un-ticked set un-ticked even if the draft still names it', async () => {
    localStorage.setItem('ironlog_workout_draft_1', JSON.stringify({
      sets: { 10: { 1: { reps: '8', weight: '77.5', done: true, touched: true } } },
      cardio: {},
    }));
    mockFetch([]);
    const { container } = resumeWorkout();
    await settle();

    expect(cell(container, 0).done).toBe(false);
  });

  // Notes are only sent when the workout is finished, so nothing but the draft
  // is holding them while it is still in progress.
  it('keeps workout notes that were typed before leaving', async () => {
    localStorage.setItem('ironlog_workout_draft_1', JSON.stringify({
      sets: {}, cardio: {}, notes: 'Felt strong today',
    }));
    mockFetch([]);
    const { container } = resumeWorkout();
    await settle();

    fireEvent.click(container.querySelector('.finish-section button'));
    await settle();

    expect(container.querySelector('textarea').value).toBe('Felt strong today');
  });

  it('does not overwrite a weight being typed when the last-session fetch lands late', async () => {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    api.get.mockImplementation((url) => {
      if (url === '/workouts/1') return Promise.resolve({ data: { session, exercises: withLogged([]) } });
      if (url.startsWith('/progress/last-session/')) return pending;
      return Promise.resolve({ data: null });
    });

    const { container } = resumeWorkout();
    await settle();

    // User starts entering their working weight before the suggestion arrives.
    fireEvent.change(setRow(container, 0).querySelectorAll('.set-input')[1], { target: { value: '90' } });
    await settle();

    await act(async () => {
      release({ data: { completed_at: START.toISOString(), sets: [{ set_number: 1, reps_completed: 5, weight_kg: '60.00' }] } });
      for (let i = 0; i < 8; i++) await Promise.resolve();
    });

    expect(cell(container, 0).weight).toBe('90');
  });
});
