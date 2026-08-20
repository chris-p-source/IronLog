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
  titles: [
    { title: 'Century Club', rarity: 'epic', earned: true, requirement: 'Complete 100 workouts', percent: 100, value: 100, threshold: 100 },
    { title: 'Early Bird', rarity: 'common', earned: true, requirement: 'Finish a workout before 6am', percent: 100, value: 1, threshold: 1 },
    { title: 'Two Plate Club', rarity: 'rare', earned: false, requirement: 'Bench press 100 kg', percent: 40, value: 40, threshold: 100, unit: 'kg' },
    { title: 'Mountain Mover', rarity: 'legendary', earned: false, requirement: 'Lift 2,000,000 kg in total', percent: 6, value: 125000, threshold: 2000000, unit: 'kg' },
  ],
  earnedTitleCount: 2,
  totalTitles: 4,
  equippedTitle: 'Century Club',
  equippedRarity: 'epic',
  breakdown: { training: 8200, tracking: 800 },
  badges: [
    { id: 'first_workout', name: 'First Rep', description: 'Complete your first workout', category: 'Consistency', tier: 'bronze', threshold: 1, value: 1, earned: true, percent: 100 },
    { id: 'century_workouts', name: 'Century Club', description: 'Complete 100 workouts', category: 'Consistency', tier: 'gold', threshold: 100, value: 100, earned: true, percent: 100, title: 'Century Club' },
    { id: 'tonnage_500', name: '500 Tonnes', description: 'Lift 500,000 kg in total', category: 'Volume', tier: 'silver', threshold: 500000, value: 125000, earned: false, percent: 25, unit: 'kg' },
    { id: 'bw_bench', name: 'Bodyweight Bench', description: 'Bench press your own bodyweight', category: 'Strength', tier: 'silver', threshold: 1, value: 0.8, earned: false, percent: 80, unit: 'x', title: 'Bodyweight Bench' },
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

  it('shows where the XP came from, so tracking is discoverable', async () => {
    const { container } = render(<Achievements />);
    await flush();

    const breakdown = container.querySelector('.level-breakdown').textContent;
    expect(breakdown).toContain('8,200');
    expect(breakdown).toContain('training');
    expect(breakdown).toContain('800');
    expect(breakdown).toContain('tracking');
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

  it('draws a rare title more loudly than a common one', async () => {
    const { container } = render(<Achievements />);
    await flush();

    // The equipped title on the level card carries its rarity.
    expect(container.querySelector('.level-card-flair-row .flair-epic')).toBeTruthy();

    // And the picker shows each title at its own rarity.
    const chips = [...container.querySelectorAll('.title-chip')];
    expect(chips.find(c => c.textContent.includes('Century Club')).className).toContain('flair-epic');
    expect(chips.find(c => c.textContent.includes('Early Bird')).className).toContain('flair-common');
  });

  it('changes the glow when a different rarity is equipped', async () => {
    const { container } = render(<Achievements />);
    await flush();

    fireEvent.click(screen.getByRole('button', { name: /Early Bird/ }));
    await flush();

    const flair = container.querySelector('.level-card-flair-row .flair');
    expect(flair.className).toContain('flair-common');
    expect(flair.className).not.toContain('flair-epic');
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
    api.get.mockResolvedValue({
      data: { ...PROFILE, availableTitles: [], titles: PROFILE.titles.filter(t => !t.earned), equippedTitle: null },
    });
    const { container } = render(<Achievements />);
    await flush();

    expect(container.querySelector('.titles-empty')).toBeTruthy();
    expect(container.querySelector('.title-chip')).toBeNull();
    // Even with none earned, the ones still out there are listed.
    expect(container.querySelectorAll('.locked-title-row').length).toBe(2);
  });

  it('lists the titles still to earn, with what earns them', async () => {
    const { container } = render(<Achievements />);
    await flush();

    const locked = [...container.querySelectorAll('.locked-title-row')];
    expect(locked.length).toBe(2);

    const twoPlate = locked.find(r => r.textContent.includes('Two Plate Club'));
    expect(twoPlate.textContent).toContain('Bench press 100 kg');
    expect(twoPlate.textContent).toContain('40kg / 100kg');
    expect(twoPlate.textContent).toContain('rare');
    // Locked titles keep their rarity colour but are dimmed, not glowing.
    expect(twoPlate.querySelector('.flair-rare.flair-locked')).toBeTruthy();
  });

  it('does not offer a locked title as something you can equip', async () => {
    const { container } = render(<Achievements />);
    await flush();

    const chips = [...container.querySelectorAll('.title-chip')].map(c => c.textContent);
    expect(chips.some(c => c.includes('Century Club'))).toBe(true);
    expect(chips.some(c => c.includes('Two Plate Club'))).toBe(false);
  });

  it('tells you which title a locked badge would unlock', async () => {
    const { container } = render(<Achievements />);
    await flush();

    const locked = [...container.querySelectorAll('.badge-card:not(.earned)')];
    const withReward = locked.filter(c => c.textContent.includes('Unlocks title'));
    expect(withReward.length).toBeGreaterThan(0);
    expect(container.querySelector('.badge-unlocks.locked')).toBeTruthy();
  });

  it('degrades to a message when the profile cannot be loaded', async () => {
    api.get.mockRejectedValue(new Error('offline'));
    render(<Achievements />);
    await flush();

    expect(screen.getByText(/Could not load achievements/)).toBeTruthy();
  });
});
