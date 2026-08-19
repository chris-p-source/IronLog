import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, fireEvent, cleanup, screen } from '@testing-library/react';
import Achievements from './Achievements';
import api from '../api';

vi.mock('../api', () => ({
  default: { get: vi.fn(), put: vi.fn() },
}));

const PROFILE = {
  xp: 9000,
  level: 10,
  title: 'Committed',
  xpIntoLevel: 900,
  xpForNextLevel: 1400,
  xpToNextLevel: 500,
  percent: 64,
  earnedCount: 2,
  totalBadges: 4,
  availableTitles: ['Century Club', 'Early Bird'],
  equippedTitle: 'Century Club',
  badges: [
    { id: 'first_workout', name: 'First Rep', description: 'Complete your first workout', category: 'Consistency', tier: 'bronze', threshold: 1, value: 1, earned: true, percent: 100 },
    { id: 'century_workouts', name: 'Century Club', description: 'Complete 100 workouts', category: 'Consistency', tier: 'gold', threshold: 100, value: 100, earned: true, percent: 100, title: 'Century Club' },
    { id: 'tonnage_500', name: '500 Tonnes', description: 'Lift 500,000 kg in total', category: 'Volume', tier: 'silver', threshold: 500000, value: 125000, earned: false, percent: 25, unit: 'kg' },
    { id: 'bw_bench', name: 'Bodyweight Bench', description: 'Bench press your own bodyweight', category: 'Strength', tier: 'silver', threshold: 1, value: 0.8, earned: false, percent: 80, unit: 'x' },
  ],
};

const flush = () => act(async () => { await Promise.resolve(); });

describe('Achievements', () => {
  beforeEach(() => {
    api.get.mockResolvedValue({ data: PROFILE });
    api.put.mockResolvedValue({ data: {} });
  });

  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows the level, title and progress to the next level', async () => {
    const { container } = render(<Achievements />);
    await flush();

    expect(container.querySelector('.level-ring-num').textContent).toBe('10');
    expect(container.querySelector('.level-card-title').textContent).toBe('Committed');
    expect(container.querySelector('.level-card-xp').textContent).toBe('9,000 XP');
    expect(container.querySelector('.level-progress-fill').style.width).toBe('64%');
    expect(screen.getByText(/500 XP to level 11/)).toBeTruthy();
  });

  it('shows progress towards badges that are not yet earned', async () => {
    const { container } = render(<Achievements />);
    await flush();

    const cards = [...container.querySelectorAll('.badge-card')];
    const tonnage = cards.find(c => c.textContent.includes('500 Tonnes'));
    expect(tonnage.className).not.toContain('earned');
    // Big kilogram numbers are shown as tonnes rather than six digits.
    expect(tonnage.textContent).toContain('125t / 500t');

    const bench = cards.find(c => c.textContent.includes('Bodyweight Bench'));
    expect(bench.textContent).toContain('0.80x / 1.00x');
  });

  it('earned badges come first, then whatever is closest', async () => {
    const { container } = render(<Achievements />);
    await flush();

    const names = [...container.querySelectorAll('.badge-name')].map(n => n.textContent);
    expect(names.slice(0, 2).sort()).toEqual(['Century Club', 'First Rep']);
    // 80% before 25%
    expect(names.slice(2)).toEqual(['Bodyweight Bench', '500 Tonnes']);
  });

  it('does not show a progress bar on an earned badge', async () => {
    const { container } = render(<Achievements />);
    await flush();

    const earned = [...container.querySelectorAll('.badge-card.earned')];
    expect(earned.length).toBe(2);
    expect(earned.every(c => c.querySelector('.badge-progress-track') === null)).toBe(true);
  });

  it('filters badges by category', async () => {
    const { container } = render(<Achievements />);
    await flush();

    fireEvent.click(screen.getByRole('button', { name: 'Volume' }));
    const names = [...container.querySelectorAll('.badge-name')].map(n => n.textContent);
    expect(names).toEqual(['500 Tonnes']);
  });

  it('equips a title and saves it', async () => {
    const { container } = render(<Achievements />);
    await flush();

    expect(container.querySelector('.title-chip.active').textContent).toContain('Century Club');

    fireEvent.click(screen.getByRole('button', { name: /Early Bird/ }));
    await flush();

    expect(api.put).toHaveBeenCalledWith('/gamification/title', { title: 'Early Bird' });
    expect(container.querySelector('.title-chip.active').textContent).toContain('Early Bird');
  });

  it('puts the title back if saving it fails', async () => {
    api.put.mockRejectedValue(new Error('nope'));
    const { container } = render(<Achievements />);
    await flush();

    fireEvent.click(screen.getByRole('button', { name: /Early Bird/ }));
    await flush();

    expect(container.querySelector('.title-chip.active').textContent).toContain('Century Club');
  });

  it('tells a user with no titles how to get one', async () => {
    api.get.mockResolvedValue({ data: { ...PROFILE, availableTitles: [], equippedTitle: null } });
    const { container } = render(<Achievements />);
    await flush();

    expect(container.querySelector('.titles-empty')).toBeTruthy();
    expect(container.querySelector('.title-chip')).toBeNull();
  });

  it('degrades to a message when the profile cannot be loaded', async () => {
    api.get.mockRejectedValue(new Error('offline'));
    render(<Achievements />);
    await flush();

    expect(screen.getByText(/Could not load achievements/)).toBeTruthy();
  });
});
