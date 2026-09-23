import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, fireEvent, cleanup, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SharedTemplates, { SharedTemplateCard } from './SharedTemplates';
import api from '../api';

vi.mock('../api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

// The library debounces its query behind a timer, so waiting on microtasks
// alone is not enough to see the first render.
const flush = () => act(async () => {
  await new Promise(r => setTimeout(r, 20));
  for (let i = 0; i < 6; i++) await Promise.resolve();
});

const shared = (over = {}) => ({
  id: 7,
  name: 'Push Day',
  template_type: 'strength',
  description: 'Beginner push session',
  author: 'lifter',
  source_author: null,
  is_own: false,
  exercise_count: 2,
  add_count: 3,
  already_added: false,
  ...over,
});

const detail = {
  ...shared(),
  exercises: [
    { name: 'Barbell Bench Press', exercise_type: 'strength', sets: 3, reps: 5, base_weight_kg: '80.00' },
    { name: 'Overhead Press', exercise_type: 'strength', sets: 3, reps: 8, base_weight_kg: null },
  ],
};

const renderCard = (template, onAdded) => render(
  <MemoryRouter><SharedTemplateCard template={template} onAdded={onAdded} /></MemoryRouter>
);

describe('SharedTemplateCard', () => {
  beforeEach(() => {
    api.get.mockResolvedValue({ data: detail });
    api.post.mockResolvedValue({ data: { id: 99, name: 'Push Day' } });
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('credits the author and says how many people took it', async () => {
    const { container } = renderCard(shared());
    expect(container.querySelector('.template-name').textContent).toBe('Push Day');
    expect(container.querySelector('.shared-template-author').textContent).toBe('by @lifter');
    expect(container.querySelector('.template-meta').textContent).toContain('added by 3');
    expect(container.querySelector('.shared-template-description').textContent).toBe('Beginner push session');
  });

  // Nobody should have to take a programme on the strength of its name alone.
  it('shows the actual sets and reps when expanded', async () => {
    const { container } = renderCard(shared());
    fireEvent.click(screen.getByRole('button', { name: /^View$/ }));
    await flush();

    const rows = [...container.querySelectorAll('.shared-template-exercise')].map(r => r.textContent);
    expect(rows[0]).toContain('Barbell Bench Press');
    expect(rows[0]).toContain('3 × 5 @ 80kg');
    // No base weight means no weight shown, rather than "@ 0kg".
    expect(rows[1]).toContain('3 × 8');
    expect(rows[1]).not.toContain('@');
  });

  it('adds a copy and then says it is already yours', async () => {
    const onAdded = vi.fn();
    renderCard(shared(), onAdded);

    fireEvent.click(screen.getByRole('button', { name: /Add/ }));
    await flush();

    expect(api.post).toHaveBeenCalledWith('/templates/shared/7/add');
    expect(onAdded).toHaveBeenCalledWith({ id: 99, name: 'Push Day' });
    expect(screen.getByRole('button', { name: /Added/ }).disabled).toBe(true);
  });

  it('starts as Added for one already taken', async () => {
    renderCard(shared({ already_added: true }));
    expect(screen.getByRole('button', { name: /Added/ }).disabled).toBe(true);
  });

  it('offers no Add button on your own template', async () => {
    const { container } = renderCard(shared({ is_own: true }));
    expect(screen.queryByRole('button', { name: /Add/ })).toBeNull();
    expect(container.querySelector('.shared-template-own').textContent).toBe('Yours');
  });

  it('surfaces a failed add instead of silently doing nothing', async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'Template not found' } } });
    renderCard(shared());

    fireEvent.click(screen.getByRole('button', { name: /Add/ }));
    await flush();

    expect(screen.getByText('Template not found')).toBeTruthy();
    // Still offering the action, since it did not happen.
    expect(screen.getByRole('button', { name: /Add/ })).toBeTruthy();
  });

  it('keeps the original author credited on a re-shared copy', async () => {
    const { container } = renderCard(shared({ author: 'trainee', source_author: 'lifter' }));
    expect(container.querySelector('.shared-template-author').textContent).toBe('by @trainee');
    expect(container.querySelector('.shared-template-adapted').textContent).toBe('adapted from @lifter');
  });

  it('does not credit a copy back to its own author', async () => {
    const { container } = renderCard(shared({ author: 'lifter', source_author: 'lifter' }));
    expect(container.querySelector('.shared-template-adapted')).toBeNull();
  });
});

describe('SharedTemplates library', () => {
  beforeEach(() => {
    api.get.mockImplementation((url) => {
      if (url === '/templates/shared') return Promise.resolve({ data: [shared()] });
      return Promise.resolve({ data: detail });
    });
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  const renderLibrary = () => render(<MemoryRouter><SharedTemplates /></MemoryRouter>);

  it('lists what has been shared', async () => {
    const { container } = renderLibrary();
    await flush();
    expect(container.querySelectorAll('.shared-template-card')).toHaveLength(1);
  });

  it('explains an empty library rather than showing a blank page', async () => {
    api.get.mockResolvedValue({ data: [] });
    const { container } = renderLibrary();
    await flush();
    expect(container.querySelector('.empty-state h3').textContent).toBe('No Shared Templates Yet');
  });

  it('says when a search matches nothing, which is a different problem', async () => {
    api.get.mockResolvedValue({ data: [] });
    renderLibrary();
    await flush();

    fireEvent.change(screen.getByPlaceholderText(/Search templates/), { target: { value: 'zzz' } });
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });

    expect(screen.getByText('Nothing Matches')).toBeTruthy();
  });

  it('asks the server to filter, so exercises inside a template are searchable', async () => {
    renderLibrary();
    await flush();

    fireEvent.change(screen.getByPlaceholderText(/Search templates/), { target: { value: 'bench' } });
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });

    expect(api.get).toHaveBeenLastCalledWith('/templates/shared', {
      params: { search: 'bench', type: undefined, sort: 'new' },
    });
  });

  it('filters by type', async () => {
    renderLibrary();
    await flush();

    fireEvent.click(screen.getByRole('button', { name: /Cardio/ }));
    await flush();

    expect(api.get).toHaveBeenLastCalledWith('/templates/shared', {
      params: { search: undefined, type: 'cardio', sort: 'new' },
    });
  });

  it('can rank by how many people took a template', async () => {
    renderLibrary();
    await flush();

    fireEvent.click(screen.getByRole('button', { name: /Most Added/ }));
    await flush();

    expect(api.get).toHaveBeenLastCalledWith('/templates/shared', {
      params: { search: undefined, type: undefined, sort: 'popular' },
    });
  });
});
