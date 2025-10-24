// Local-only implementation replacing Supabase for fully offline development.
  type UUID = string;

  type DemoUser = {
    id: UUID;
    email: string;
    password: string;
  };

  type DemoDB = {
    users: DemoUser[];
    profiles: any[];
    events: any[];
    event_attendance: any[];
    event_interactions: any[];
    user_interests: any[];
    user_vibes: any[];
    email_preferences: any[];
    user_connections: any[];
  };

  const STORAGE_KEY = 'demo_db_v7'; // Fixed: removed overly aggressive signature filtering blocking all events
  const SESSION_KEY = 'demo_session_v1';

  const randomId = () => crypto.randomUUID();

  const loadDB = (): DemoDB => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    const seeded: DemoDB = {
      users: [
        { id: randomId(), email: 'demo@spoton.local', password: 'password' }
      ],
      profiles: [],
      events: [], // Start with empty events - all events will come from scraping
      event_attendance: [],
      event_interactions: [],
      user_interests: [],
      user_vibes: [],
      email_preferences: [],
      user_connections: [],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  };

  const saveDB = (db: DemoDB) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  };

  const getSession = () => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const setSession = (session: any | null) => {
    if (!session) localStorage.removeItem(SESSION_KEY);
    else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  };

  const listeners = new Set<(event: string, session: any | null) => void>();
  const emit = (event: string, session: any | null) => {
    listeners.forEach((cb) => cb(event, session));
  };

  const filterHelpers = () => {
    let currentFilter: ((row: any) => boolean)[] = [];
    let orderBy: { key: string; ascending: boolean } | null = null;
    return {
      addEq: (key: string, value: any) => currentFilter.push((r) => r[key] === value),
      addIn: (key: string, values: any[]) => currentFilter.push((r) => values.includes(r[key])),
      addOr: (_expr: string) => { /* no-op simple demo */ },
      setOrder: (key: string, ascending: boolean) => { orderBy = { key, ascending }; },
      apply: (rows: any[]) => {
        let res = rows.filter((r) => currentFilter.every((fn) => fn(r)));
        if (orderBy) {
          res = [...res].sort((a, b) => {
            const av = a[orderBy!.key];
            const bv = b[orderBy!.key];
            if (av === bv) return 0;
            return (av > bv ? 1 : -1) * (orderBy!.ascending ? 1 : -1);
          });
        }
        return res;
      }
    };
  };

  const tableApi = (table: keyof DemoDB) => {
    // Special handling for events table - use backend API
    if (table === 'events') {
      const selectBuilder = (_columns?: string) => {
        const thenable: any = {
          eq: (key: string, value: any) => thenable,
          in: (key: string, values: any[]) => thenable,
          or: (expr: string) => thenable,
          order: (key: string, options?: { ascending?: boolean }) => thenable,
          async single() {
            try {
              const res = await fetch('/api/events?limit=1');
              const events = await res.json();
              return { data: events[0] ?? null, error: null };
            } catch (e) {
              return { data: null, error: e };
            }
          },
          async maybeSingle() {
            return this.single();
          },
          async execute() {
            try {
              const res = await fetch('/api/events?limit=100');
              const events = await res.json();
              return { data: events, error: null };
            } catch (e) {
              return { data: [], error: e };
            }
          },
          async then(resolve: any) {
            try {
              const res = await fetch('/api/events?limit=100');
              const events = await res.json();
              resolve({ data: events, error: null });
            } catch (e) {
              resolve({ data: [], error: e });
            }
          }
        };
        return thenable;
      };
      return {
        select: (_columns?: string) => selectBuilder(_columns),
        insert: async () => ({ data: null, error: null }),
        update: () => ({ eq: async () => ({ data: null, error: null }) }),
        delete: () => ({ eq: () => ({ then: (resolve: any) => resolve({ data: null, error: null }) }) })
      };
    }
    
    const db = loadDB();
    const f = filterHelpers();
    const build = (rows: any[]) => ({ data: rows, error: null });
    const selectBuilder = (_columns?: string) => {
      const thenable: any = {
        eq: (key: string, value: any) => { f.addEq(key, value); return thenable; },
        in: (key: string, values: any[]) => { f.addIn(key, values); return thenable; },
        or: (expr: string) => { f.addOr(expr); return thenable; },
        order: (key: string, options?: { ascending?: boolean }) => { f.setOrder(key, options?.ascending !== false); return thenable; },
        async single() {
          const rows = f.apply((db as any)[table]);
          return { data: rows[0] ?? null, error: null };
        },
        async maybeSingle() {
          const rows = f.apply((db as any)[table]);
          return { data: rows[0] ?? null, error: null };
        },
        async execute() { return build(f.apply((db as any)[table])); },
        then(resolve: any) { resolve(build(f.apply((db as any)[table]))); }
      };
      return thenable;
    };
    const api = {
      select: (_columns?: string) => selectBuilder(_columns),
      insert: async (payload: any | any[]) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        const withIds = rows.map((r) => ({ id: r.id ?? randomId(), ...r }));
        (db as any)[table] = [ ...(db as any)[table], ...withIds ];
        saveDB(db);
        return { data: withIds, error: null };
      },
      update: (patch: any) => ({
        eq: async (key: string, value: any) => {
          (db as any)[table] = (db as any)[table].map((r: any) => r[key] === value ? { ...r, ...patch } : r);
          saveDB(db);
          return { data: null, error: null };
        }
      }),
      delete: () => {
        const filters: Array<{ key: string; value: any }> = [];
        const run = () => {
          if (filters.length === 0) return { data: null, error: null };
          (db as any)[table] = (db as any)[table].filter((row: any) => {
            // Keep rows that do NOT match all filters
            return !filters.every(({ key, value }) => row[key] === value);
          });
          saveDB(db);
          return { data: null, error: null };
        };
        const builder: any = {
          eq(key: string, value: any) {
            filters.push({ key, value });
            // Return a thenable so awaiting after one or two eq() calls works
            const next: any = {
              eq(k: string, v: any) {
                filters.push({ key: k, value: v });
                // Return thenable promise-like for final await
                return {
                  then(resolve: any) { resolve(run()); }
                };
              },
              then(resolve: any) { resolve(run()); }
            };
            return next;
          },
          then(resolve: any) { resolve(run()); }
        };
        return builder;
      }
    };
    return api;
  };

  const authApi = {
    async signInWithPassword({ email, password }: { email: string; password: string; }) {
      const db = loadDB();
      const user = db.users.find((u) => u.email === email && u.password === password);
      if (!user) return { data: { user: null }, error: { message: 'Invalid credentials' } } as any;
      const session = { user: { id: user.id, email: user.email } };
      setSession(session);
      emit('SIGNED_IN', session);
      return { data: { user: session.user }, error: null } as any;
    },
    async signUp({ email, password }: { email: string; password: string; options?: any; }) {
      const db = loadDB();
      if (db.users.some((u) => u.email === email)) {
        return { data: null, error: { message: 'User already exists' } } as any;
      }
      const newUser = { id: randomId(), email, password };
      db.users.push(newUser);
      saveDB(db);
      const session = { user: { id: newUser.id, email: newUser.email } };
      setSession(session);
      emit('SIGNED_IN', session);
      return { data: { user: session.user }, error: null } as any;
    },
    async signOut() {
      setSession(null);
      emit('SIGNED_OUT', null);
      return { error: null } as any;
    },
    onAuthStateChange(callback: (event: any, session: any) => void) {
      listeners.add(callback);
      const current = getSession();
      // emit initial state asynchronously
      setTimeout(() => callback(current ? 'INITIAL_SESSION' : 'SIGNED_OUT', current), 0);
      return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } } as any;
    },
    async getSession() {
      const session = getSession();
      return { data: { session }, error: null } as any;
    },
    async getUser() {
      const session = getSession();
      return { data: { user: session?.user ?? null }, error: null } as any;
    },
    async signInWithOAuth(_opts: any) {
      return { data: null, error: { message: 'OAuth disabled in demo mode' } } as any;
    }
  };

  const functionsApi = {
    async invoke(name: string, opts?: { body?: any }) {
      if (name === 'loading-messages') {
        try {
          const res = await fetch('/api/loading-messages');
          if (res.ok) {
            const data = await res.json();
            return { data, error: null } as any;
          }
        } catch {}
        return { data: { messages: [
          'Finding your perfect events...',
          'Discovering amazing experiences...',
          'Curating events just for you...'
        ] }, error: null } as any;
      }
      if (name === 'discover-events') {
        // Call local API, then merge returned events into local store
        try {
          const res = await fetch('/api/discover-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(opts?.body || {})
          });
          if (res.ok) {
            const payload = await res.json();
            const db = loadDB();
            const beforeCount = db.events.length;
            const existingKeys = new Set(db.events.map((e: any) => `${(e.title||'').toLowerCase()}|${(e.date||'').slice(0,10)}|${(e.location||'').toLowerCase()}`));
            const toInsert = (payload.events || []).filter((ev: any) => {
              const key = `${(ev.title||'').toLowerCase()}|${(ev.date||'').slice(0,10)}|${(ev.location||'').toLowerCase()}`;
              return !existingKeys.has(key);
            }).map((ev: any) => ({ id: randomId(), ...ev }));
            db.events = [...db.events, ...toInsert];
            saveDB(db);
            return { data: {
              eventsCount: toInsert.length,
              totalEvents: db.events.length,
              existingCount: (payload.events || []).length - toInsert.length,
              scrapingStatus: payload.scrapingStatus || []
            }, error: null } as any;
          }
        } catch (e) {
          console.error('discover-events error', e);
        }
        return { data: { eventsCount: 0, totalEvents: loadDB().events.length, existingCount: 0, scrapingStatus: [] }, error: null } as any;
      }
      return { data: null, error: { message: `Function ${name} not available` } } as any;
    }
  };

  export const supabase: any = {
    auth: authApi,
    functions: functionsApi,
    from: (table: keyof DemoDB) => tableApi(table),
  };