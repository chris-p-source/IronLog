import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Feed from './Feed';
import api from '../api';

vi.mock('../api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const flush = () => act(async () => {
  await new Promise(r => setTimeout(r, 20));
  for (let i = 0; i < 6; i++) await Promise.resolve();
});

const workout = {
  id: 1,
  kind: 'workout',
  happened_at: '2026-09-23T10:00:00.000Z',
  completed_at: '2026-09-23T10:00:00.000Z',
  username: 'lifter',
  template_name: 'Push Day',
  template_type: 'strength',
  exercise_count: 2,
  sets_completed: 6,
  total_volume: '2400',
  duration_seconds: 3000,
};

const share = {
  id: 'template-7',
  kind: 'template_shared',
  happened_at: '2026-09-23T11:00:00.000Z',
  username: 'coach',
  template: {
    id: 7,
    name: 'Beginner Push',
    template_type: 'strength',
    description: 'Start here',
    author: 'coach',
    source_author: null,
    is_own: false,
    exercise_count: 2,
    add_count: 4,
    already_added: false,
  },
};

const renderFeed = () => render(<MemoryRouter><Feed /></MemoryRouter>);

describe('Feed', () => {
  beforeEach(() => {
    api.post.mockResolvedValue({ data: { id: 99 } });
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('still shows finished workouts', async () => {
    api.get.mockResolvedValue({ data: [workout] });
    const { container } = renderFeed();
    await flush();

    expect(container.querySelector('.feed-card-workout').textContent).toBe('Push Day');
    expect(container.querySelector('.feed-card-stats').textContent).toContain('6 sets');
  });

  it('does not say "1 exercises"', async () => {
    api.get.mockResolvedValue({ data: [{ ...workout, exercise_count: '1', sets_completed: '1' }] });
    const { container } = renderFeed();
    await flush();

    const stats = container.querySelector('.feed-card-stats').textContent;
    expect(stats).toContain('1 exercise');
    expect(stats).not.toContain('1 exercises');
    expect(stats).toContain('1 set');
    expect(stats).not.toContain('1 sets');
  });

  it('shows a shared template as a card you can add from', async () => {
    api.get.mockResolvedValue({ data: [share] });
    const { container } = renderFeed();
    await flush();

    expect(container.querySelector('.feed-card-time').textContent).toContain('shared a template');
    expect(container.querySelector('.shared-template-card')).toBeTruthy();
    expect(container.querySelector('.template-name').textContent).toBe('Beginner Push');

    fireEvent.click(screen.getByRole('button', { name: /Add/ }));
    await flush();
    expect(api.post).toHaveBeenCalledWith('/templates/shared/7/add');
  });

  // Both kinds share one list, so a key collision would break rendering.
  it('renders workouts and shares together', async () => {
    api.get.mockResolvedValue({ data: [share, workout] });
    const { container } = renderFeed();
    await flush();

    expect(container.querySelectorAll('.feed-share')).toHaveLength(1);
    expect(container.querySelectorAll('.feed-card')).toHaveLength(1);
  });

  it('explains an empty feed', async () => {
    api.get.mockResolvedValue({ data: [] });
    const { container } = renderFeed();
    await flush();
    expect(container.querySelector('.empty-state h3').textContent).toBe('Nothing here yet');
  });
});
