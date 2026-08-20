import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, fireEvent, cleanup, screen } from '@testing-library/react';
import SupplementSection from './SupplementSection';
import api from '../api';

vi.mock('../api', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

function mockApi({ taken = [], recent = [] } = {}) {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/nutrition/supplements/recent')) return Promise.resolve({ data: recent });
    if (url.startsWith('/nutrition/supplements')) return Promise.resolve({ data: taken });
    return Promise.resolve({ data: [] });
  });
}

describe('SupplementSection', () => {
  beforeEach(() => {
    mockApi();
    api.post.mockImplementation((url, body) =>
      Promise.resolve({ data: { id: 99, name: body.name, dose: body.dose, unit: body.unit } }));
    api.delete.mockResolvedValue({ data: { deleted: true } });
  });

  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('offers common supplements to a user with no history', async () => {
    render(<SupplementSection date="2026-08-20" />);
    await flush();

    expect(screen.getByRole('button', { name: /Creatine/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Whey Protein/ })).toBeTruthy();
  });

  it('offers your own stack once you have one, with the dose you last took', async () => {
    mockApi({ recent: [{ name: 'Creatine', dose: 7, unit: 'g' }] });
    const { container } = render(<SupplementSection date="2026-08-20" />);
    await flush();

    const chips = [...container.querySelectorAll('.supp-suggestion')].map(c => c.textContent);
    expect(chips).toHaveLength(1);
    expect(chips[0]).toContain('Creatine');
    expect(chips[0]).toContain('7 g');
  });

  it('logs a supplement for the day being viewed', async () => {
    const { container } = render(<SupplementSection date="2026-08-19" />);
    await flush();

    fireEvent.click(screen.getByRole('button', { name: /Creatine/ }));
    await flush();

    expect(api.post).toHaveBeenCalledWith('/nutrition/supplements', {
      name: 'Creatine', dose: 5, unit: 'g', date: '2026-08-19',
    });
    const row = container.querySelector('.supp-row.taken');
    expect(row.textContent).toContain('Creatine');
    expect(row.textContent).toContain('5 g');
  });

  it('moves a logged supplement out of the suggestions', async () => {
    const { container } = render(<SupplementSection date="2026-08-20" />);
    await flush();

    fireEvent.click(screen.getByRole('button', { name: /^\+?Creatine/ }));
    await flush();

    const chips = [...container.querySelectorAll('.supp-suggestion')].map(c => c.textContent);
    expect(chips.some(c => c.includes('Creatine'))).toBe(false);
    expect(container.querySelectorAll('.supp-row.taken')).toHaveLength(1);
  });

  it('shows what has been taken today, with the count', async () => {
    mockApi({ taken: [
      { id: 1, name: 'Creatine', dose: 5, unit: 'g' },
      { id: 2, name: 'Multivitamin', dose: null, unit: null },
    ] });
    const { container } = render(<SupplementSection date="2026-08-20" />);
    await flush();

    expect(container.querySelectorAll('.supp-row.taken')).toHaveLength(2);
    expect(container.querySelector('.meal-section-cal').textContent).toBe('2 taken');
    // A dose-less entry is just a tick, with no stray unit text.
    const multi = [...container.querySelectorAll('.supp-row')].find(r => r.textContent.includes('Multivitamin'));
    expect(multi.querySelector('.supp-dose')).toBeNull();
  });

  it('un-marks a supplement', async () => {
    mockApi({ taken: [{ id: 7, name: 'Creatine', dose: 5, unit: 'g' }] });
    const { container } = render(<SupplementSection date="2026-08-20" />);
    await flush();

    fireEvent.click(container.querySelector('.supp-remove'));
    await flush();

    expect(api.delete).toHaveBeenCalledWith('/nutrition/supplements/7');
    expect(container.querySelectorAll('.supp-row.taken')).toHaveLength(0);
  });

  it('puts the row back if un-marking fails', async () => {
    mockApi({ taken: [{ id: 7, name: 'Creatine', dose: 5, unit: 'g' }] });
    api.delete.mockRejectedValue(new Error('offline'));
    const { container } = render(<SupplementSection date="2026-08-20" />);
    await flush();

    fireEvent.click(container.querySelector('.supp-remove'));
    await flush();

    expect(container.querySelectorAll('.supp-row.taken')).toHaveLength(1);
  });

  it('adds a supplement that is not in the list', async () => {
    const { container } = render(<SupplementSection date="2026-08-20" />);
    await flush();

    fireEvent.click(screen.getByTitle('Add supplement'));
    fireEvent.change(screen.getByPlaceholderText('Creatine'), { target: { value: 'Ashwagandha' } });
    fireEvent.change(screen.getByPlaceholderText('5'), { target: { value: '600' } });
    fireEvent.click(screen.getByRole('button', { name: 'mg' }));
    fireEvent.click(screen.getByRole('button', { name: /Log Supplement/ }));
    await flush();

    expect(api.post).toHaveBeenCalledWith('/nutrition/supplements', {
      name: 'Ashwagandha', dose: 600, unit: 'mg', date: '2026-08-20',
    });
    expect(container.querySelector('.supp-row.taken').textContent).toContain('Ashwagandha');
  });

  it('will not log a supplement with no name', async () => {
    render(<SupplementSection date="2026-08-20" />);
    await flush();

    fireEvent.click(screen.getByTitle('Add supplement'));
    const save = screen.getByRole('button', { name: /Log Supplement/ });
    expect(save.disabled).toBe(true);

    fireEvent.click(save);
    await flush();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('reloads when the diary date changes', async () => {
    const { rerender } = render(<SupplementSection date="2026-08-20" />);
    await flush();
    expect(api.get).toHaveBeenCalledWith('/nutrition/supplements?date=2026-08-20');

    rerender(<SupplementSection date="2026-08-19" />);
    await flush();
    expect(api.get).toHaveBeenCalledWith('/nutrition/supplements?date=2026-08-19');
  });
});
