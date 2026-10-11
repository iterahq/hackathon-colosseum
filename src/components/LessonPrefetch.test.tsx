import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/i18n';
import { queryKeys } from '@/lib/queryKeys';
import { LessonPrefetch, lessonIdOf } from './LessonPrefetch';

const mocks = vi.hoisted(() => ({
  session: { access_token: 'real' } as { access_token: string } | null,
  getLesson: vi.fn(async (_id: string) => ({ id: 'l', title: {}, activities: [], placement: {} })),
  getUserId: vi.fn(async () => 'u1'),
  loadPlayer: vi.fn(async () => ({})),
}));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ session: mocks.session, configured: true }) }));
vi.mock('@/services/programs.service', () => ({ getLessonWithActivities: (id: string) => mocks.getLesson(id) }));
vi.mock('@/services/iteraUser', () => ({ getIteraUserId: () => mocks.getUserId() }));
vi.mock('@/pages/learnerPageLoaders', () => ({ loadLessonPlayer: () => mocks.loadPlayer() }));
vi.mock('@/services/guestSession.service', () => ({ isGuestAccessToken: (t?: string) => t === 'guest' }));

const LESSON = '0e7d6618-f9ba-46ba-bf28-71cf86f32716';

function mount(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  localStorage.setItem('itera.locale', 'en');
  render(
    <I18nProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <LessonPrefetch />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  );
  return client;
}

describe('LessonPrefetch', () => {
  it('reads the lesson id only from /lesson/<uuid>', () => {
    expect(lessonIdOf(`/lesson/${LESSON}`)).toBe(LESSON);
    expect(lessonIdOf(`/lesson/${LESSON}/`)).toBe(LESSON);
    expect(lessonIdOf('/lesson/not-a-uuid')).toBeNull();
    expect(lessonIdOf('/program/itera-v2')).toBeNull();
  });

  it('starts the lesson read, the user id and the player chunk as soon as a session is known', async () => {
    mocks.getLesson.mockClear();
    const client = mount(`/lesson/${LESSON}`);
    await waitFor(() => expect(mocks.getLesson).toHaveBeenCalledWith(LESSON));
    expect(mocks.getUserId).toHaveBeenCalled();
    expect(mocks.loadPlayer).toHaveBeenCalled();
    await waitFor(() => expect(client.getQueryData(queryKeys.lesson.byId(LESSON, 'en'))).toBeTruthy());
    localStorage.clear();
  });

  it('does nothing off the lesson route or for a guest token', async () => {
    mocks.getLesson.mockClear();
    mount('/catalog');
    mocks.session = { access_token: 'guest' };
    mount(`/lesson/${LESSON}`);
    await new Promise((r) => setTimeout(r, 30));
    expect(mocks.getLesson).not.toHaveBeenCalled();
    mocks.session = { access_token: 'real' };
    localStorage.clear();
  });
});
