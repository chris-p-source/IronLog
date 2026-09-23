import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, fireEvent, cleanup, screen } from '@testing-library/react';
import GoalsCard from './GoalsCard';
import api from '../api';

vi.mock('../api', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

const goal = (over = {}) => ({
  id: 1,
  exercise_name: 'Barbell Bench Press',
  target_weight_kg: 100,
  target_reps: 5,
  achieved_at: null,
  current_best_weight_kg: 85,
  current_e1rm: 99.2,
  target_e1rm: 116.7,
  percent: 85,
  forecast: {
    status: 'ready',
    ratePerWeek: 1.24,
    weeksRemaining: 6.2,
    projectedDate: '2026-11-04T00:00:00.000Z',
    confidence: 'high',
  },
  ...over,
});

function mockApi(goals = []) {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/goals')) return Promise.resolve({ data: goals });
    if (url.startsWith('/exercises/strength')) {
      return Promise.resolve({ data: [{ name: 'Barbell Bench Press', group: 'Chest' }, { name: 'Barbell Back Squat', group: 'Quads' }] });
    }
    return Promise.resolve({ data: [] });
  });
}

describe('GoalsCard', () => {
  beforeEach(() => {
    mockApi();
    api.post.mockImplementation((url, body) => Promise.resolve({ data: goal({ ...body, id: 2 }) }));
    api.delete.mockResolvedValue({ data: { deleted: true } });
  });

  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('explains itself when no goals are set', async () => {
    const { container } = render(<GoalsCard />);
    await flush();
    expect(container.querySelector('.goals-empty')).toBeTruthy();
  });

  it('shows the target, current best and progress', async () => {
    mockApi([goal()]);
    const { container } = render(<GoalsCard />);
    await flush();

    expect(container.querySelector('.goal-exercise').textContent).toBe('Barbell Bench Press');
    expect(container.querySelector('.goal-target').textContent).toBe('100kg × 5');
    expect(container.querySelector('.goal-numbers').textContent).toContain('85kg');
    expect(container.querySelector('.goal-numbers').textContent).toContain('99.2 / 116.7');
    expect(container.querySelector('.goal-progress-fill').style.width).toBe('85%');
  });

  it('gives the projected date, the rate and how much to trust it', async () => {
    mockApi([goal()]);
    const { container } = render(<GoalsCard />);
    await flush();

    const line = container.querySelector('.goal-forecast').textContent;
    expect(line).toMatch(/4 Nov 2026/);
    expect(line).toContain('about 6 weeks');
    expect(line).toContain('+1.2 kg/week');
    expect(container.querySelector('.goal-confidence.high')).toBeTruthy();
  });

  // A refusal has to say why, or it just looks broken.
  it('says why there is no forecast when history is thin', async () => {
    mockApi([goal({ forecast: { status: 'not_enough_data', sessionsNeeded: 2 } })]);
    const { container } = render(<GoalsCard />);
    await flush();

    expect(container.querySelector('.goal-forecast').textContent).toContain('2 more sessions');
    expect(container.querySelector('.goal-forecast.muted')).toBeTruthy();
  });

  it('says so when progress has stalled rather than inventing a date', async () => {
    mockApi([goal({ forecast: { status: 'no_upward_trend', ratePerWeek: -0.3 } })]);
    const { container } = render(<GoalsCard />);
    await flush();

    expect(container.querySelector('.goal-forecast').textContent).toContain('No upward trend');
  });

  it('flags a target the recent trend already covers', async () => {
    mockApi([goal({ forecast: { status: 'within_reach', weeksRemaining: 0 } })]);
    const { container } = render(<GoalsCard />);
    await flush();

    expect(container.querySelector('.goal-forecast.within-reach').textContent).toContain('Within reach now');
  });

  it('reports a very distant target as out of horizon instead of a date', async () => {
    mockApi([goal({ forecast: { status: 'beyond_horizon', horizonWeeks: 104, ratePerWeek: 0.08 } })]);
    const { container } = render(<GoalsCard />);
    await flush();

    const line = container.querySelector('.goal-forecast').textContent;
    expect(line).toContain('More than 2 years away');
    expect(line).toContain('0.1 kg/week');
  });

  it('marks an achieved goal with the date it was hit', async () => {
    mockApi([goal({ achieved_at: '2026-09-01T00:00:00.000Z', percent: 100 })]);
    const { container } = render(<GoalsCard />);
    await flush();

    expect(container.querySelector('.goal-row.achieved')).toBeTruthy();
    expect(container.querySelector('.goal-forecast.achieved').textContent).toMatch(/Achieved 1 Sept? 2026/);
    expect(container.querySelector('.goal-progress-fill.achieved')).toBeTruthy();
  });

  it('sets a goal by picking an exercise then the numbers', async () => {
    const { container } = render(<GoalsCard trained={['Barbell Bench Press']} />);
    await flush();

    fireEvent.click(screen.getByTitle('Set a goal'));
    await flush();

    // Exercises they already train are marked as such.
    expect(container.querySelector('.goal-trained')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Barbell Bench Press/ }));
    fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '120' } });
    fireEvent.change(screen.getByPlaceholderText('5'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Set Goal/ }));
    await flush();

    expect(api.post).toHaveBeenCalledWith('/goals', {
      exercise_name: 'Barbell Bench Press', target_weight_kg: 120, target_reps: 3,
    });
  });

  it('filters the exercise list by search', async () => {
    const { container } = render(<GoalsCard />);
    await flush();

    fireEvent.click(screen.getByTitle('Set a goal'));
    await flush();
    fireEvent.change(screen.getByPlaceholderText('Search exercises'), { target: { value: 'squat' } });

    const options = [...container.querySelectorAll('.goal-exercise-option')].map(o => o.textContent);
    expect(options).toEqual(['Barbell Back Squat']);
  });

  it('surfaces a rejected goal instead of failing quietly', async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'Target weight is not realistic' } } });
    render(<GoalsCard trained={['Barbell Bench Press']} />);
    await flush();

    fireEvent.click(screen.getByTitle('Set a goal'));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: /Barbell Bench Press/ }));
    fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: /Set Goal/ }));
    await flush();

    expect(screen.getByText('Target weight is not realistic')).toBeTruthy();
  });

  it('removes a goal, and puts it back if that fails', async () => {
    mockApi([goal()]);
    api.delete.mockRejectedValue(new Error('offline'));
    const { container } = render(<GoalsCard />);
    await flush();

    fireEvent.click(screen.getByTitle('Remove goal'));
    await flush();

    expect(api.delete).toHaveBeenCalledWith('/goals/1');
    expect(container.querySelectorAll('.goal-row')).toHaveLength(1);
  });
});
