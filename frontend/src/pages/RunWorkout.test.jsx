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
