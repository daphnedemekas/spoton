import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Discover from '../Discover';
import { eventAttendanceService } from '@/services/eventAttendanceService';

vi.mock('@/integrations/supabase/client', () => {
  const attendance: any[] = [];
  const events = [
    { id: 'e1', title: 'A', date: new Date().toISOString(), location: 'SAN FRANCISCO', interests: ['Live Music'], vibes: [] },
    { id: 'e2', title: 'B', date: new Date().toISOString(), location: 'SAN FRANCISCO', interests: ['Comedy Shows'], vibes: [] },
  ];
  const profiles = [{ id: 'user1', city: 'SAN FRANCISCO' }];
  const user_interests: any[] = [
    { user_id: 'user1', interest: 'Live Music' },
    { user_id: 'user1', interest: 'Comedy Shows' },
  ];
  const user_vibes: any[] = [];

  const supabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user1' } } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user1' } } } }),
    },
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { eventsCount: 0, scrapingStatus: [] } }),
    },
    from: (name: string) => {
      switch (name) {
        case 'profiles':
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: profiles[0] }),
              }),
            }),
          };
        case 'events':
          return {
            select: vi.fn().mockResolvedValue({ data: events }),
          };
        case 'event_attendance':
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: attendance }),
            }),
          };
        case 'user_interests':
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: user_interests }),
            }),
          };
        case 'user_vibes':
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: user_vibes }),
            }),
          };
        case 'user_connections':
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [] }),
                or: vi.fn().mockResolvedValue({ data: [] }),
              }),
            }),
          };
        case 'email_preferences':
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null }),
            }),
          };
        default:
          return {
            select: vi.fn().mockResolvedValue({ data: null }),
          };
      }
    },
  } as any;

  return { supabase };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<any>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('@/services/eventAttendanceService', () => {
  const service = {
    saveEvent: vi.fn().mockResolvedValue(undefined),
    dismissEvent: vi.fn().mockResolvedValue(undefined),
    logInteraction: vi.fn().mockResolvedValue(undefined),
    markAttended: vi.fn().mockResolvedValue(undefined),
    removeSavedEvent: vi.fn().mockResolvedValue(undefined),
    getSavedEvents: vi.fn().mockResolvedValue([]),
    getAttendedEvents: vi.fn().mockResolvedValue([]),
    getDismissedEvents: vi.fn().mockResolvedValue([]),
    hasInteractedWith: vi.fn().mockResolvedValue(false),
  };
  return { eventAttendanceService: service };
});

describe('Discover save/remove behavior', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('removes card from stack when saved', async () => {
    render(<Discover />);
    // allow initial load effect to run
    await waitFor(() => expect(screen.getByRole('heading', { name: /discover events/i })).toBeInTheDocument());
    const saveButton = screen.getByRole('button', { name: /save current event/i });
    fireEvent.click(saveButton);
    await waitFor(() => {
      expect(eventAttendanceService.saveEvent).toHaveBeenCalledTimes(1);
    });
  });

  it('removes card from stack when removed', async () => {
    render(<Discover />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /discover events/i })).toBeInTheDocument());
    const removeButton = screen.getByRole('button', { name: /remove current event/i });
    fireEvent.click(removeButton);
    await waitFor(() => {
      expect(eventAttendanceService.dismissEvent).toHaveBeenCalledTimes(1);
    });
  });

  it('saves event when pressing ArrowRight on the card', async () => {
    render(<Discover />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /discover events/i })).toBeInTheDocument());
    const card = screen.getAllByRole('article')[0];
    fireEvent.keyDown(card, { key: 'ArrowRight' });
    await waitFor(() => {
      expect(eventAttendanceService.saveEvent).toHaveBeenCalledTimes(1);
    });
  });

  it('dismisses event when pressing ArrowLeft on the card', async () => {
    render(<Discover />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /discover events/i })).toBeInTheDocument());
    const card = screen.getAllByRole('article')[0];
    fireEvent.keyDown(card, { key: 'ArrowLeft' });
    await waitFor(() => {
      expect(eventAttendanceService.dismissEvent).toHaveBeenCalledTimes(1);
    });
  });

  it('opens the detail dialog with Enter', async () => {
    render(<Discover />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /discover events/i })).toBeInTheDocument());
    const card = screen.getAllByRole('article')[0];
    fireEvent.keyDown(card, { key: 'Enter' });
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('persists time filter selection to localStorage', async () => {
    render(<Discover />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /discover events/i })).toBeInTheDocument());
    const todayButton = screen.getByRole('button', { name: /today/i });
    fireEvent.click(todayButton);
    await waitFor(() => {
      const stored = window.localStorage.getItem('spoton_discover_filters_v1');
      expect(stored).toContain('"timeFilter":"today"');
    });
  });

  it('restores persisted filters on load', async () => {
    window.localStorage.setItem('spoton_discover_filters_v1', JSON.stringify({ timeFilter: 'today', interests: ['Live Music'] }));
    render(<Discover />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /discover events/i })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /today/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /1 interest/ })).toBeInTheDocument();
  });
});



