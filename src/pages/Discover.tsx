import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AuthGuard } from "@/components/AuthGuard";
import { EventDetailDialog } from "@/components/EventDetailDialog";
import { ScrapingStatusPanel } from "@/components/ScrapingStatusPanel";
import { SwipeableEventCard } from "@/components/SwipeableEventCard";
import { Settings, MapPin, Sparkles, User, Search, Bookmark, CheckCircle, Heart, X, RotateCcw, Users } from "lucide-react";
import logoIcon from "@/assets/logo-icon.png";
import { useToast } from "@/hooks/use-toast";
import TinderCard from "react-tinder-card";

type Event = {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  vibes: string[];
  interests: string[];
  image_url?: string;
  event_link?: string;
};

type AttendanceStatus = "suggested" | "will_attend" | "attended" | null;

const BATCH_SIZE = 10;

export default function Discover() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [timeFilter, setTimeFilter] = useState<"today" | "this_week">("this_week");
  const [userCity, setUserCity] = useState("");
  const [loading, setLoading] = useState(true);
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [displayedEvents, setDisplayedEvents] = useState<Event[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [scrapedSites, setScrapedSites] = useState<any[]>([]);
  const [showScrapingPanel, setShowScrapingPanel] = useState(false);
  const [discoveryStep, setDiscoveryStep] = useState<'idle'|'start'|'search'|'listings'|'events'|'done'>('idle');
  const [discoveryCounts, setDiscoveryCounts] = useState<{ braveSites: number; eventLinks: number; candidatePages: number; extractedEvents: number }>({ braveSites: 0, eventLinks: 0, candidatePages: 0, extractedEvents: 0 });
  const [pendingConnectionsCount, setPendingConnectionsCount] = useState(0);
  const [loadingMessages, setLoadingMessages] = useState<string[]>([
    "Finding your perfect events...",
    "Discovering amazing experiences...",
    "Curating events just for you...",
  ]);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [isAutoDiscovering, setIsAutoDiscovering] = useState(false);
  const [isBackgroundDiscovering, setIsBackgroundDiscovering] = useState(false);
  const lastAutoDiscoverAtRef = useRef<number>(0);
  const initialDiscoveryTriggeredRef = useRef<boolean>(false);
  
  const currentIndexRef = useRef(currentIndex);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    loadData();
    loadPendingConnections();
    loadEngagingMessages();
  }, []);

  useEffect(() => {
    if (loading && loadingMessages.length > 0) {
      const interval = setInterval(() => {
        setCurrentMessageIndex((prev) => (prev + 1) % loadingMessages.length);
      }, 2000); // Change message every 2 seconds

      return () => clearInterval(interval);
    }
  }, [loading, loadingMessages]);

  // Poll discovery progress while loading or background discovering
  useEffect(() => {
    if (!loading && !isBackgroundDiscovering) return;
    let isActive = true;
    setShowScrapingPanel(true);
    const poll = async () => {
      try {
        const res = await fetch('/api/discovery-progress');
        if (!res.ok) return;
        const data = await res.json();
        if (!isActive) return;
        if (Array.isArray(data?.sites)) setScrapedSites(data.sites);
        if (data?.counts) setDiscoveryCounts({
          braveSites: Number(data.counts.braveSites || 0),
          eventLinks: Number(data.counts.eventLinks || 0),
          candidatePages: Number(data.counts.candidatePages || 0),
          extractedEvents: Number(data.counts.extractedEvents || 0),
        });
        if (data?.step) setDiscoveryStep(data.step);
      } catch {}
    };
    const id = setInterval(poll, 1000);
    poll();
    return () => { isActive = false; clearInterval(id); };
  }, [loading, isBackgroundDiscovering]);

  const loadPendingConnections = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: pendingConnections } = await supabase
        .from('user_connections')
        .select('id')
        .eq('connected_user_id', user.id)
        .eq('status', 'pending');

      setPendingConnectionsCount(pendingConnections?.length || 0);
    } catch (error) {
      console.error("Error loading pending connections:", error);
    }
  };

  const loadEngagingMessages = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('loading-messages');
      
      if (!error && data?.messages) {
        setLoadingMessages(data.messages);
      }
    } catch (error) {
      console.error("Error loading messages:", error);
      // Keep default messages on error
    }
  };

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("city")
        .eq("id", user.id)
        .single();

      if (profile) {
        setUserCity(profile.city);
        console.log('Profile city:', profile.city);
      }

      // Get user's event interactions to filter them out
      const { data: attendanceData } = await supabase
        .from("event_attendance")
        .select("event_id")
        .eq("user_id", user.id);

      const interactedEventIds = new Set(attendanceData?.map(a => a.event_id) || []);
      console.log('Interacted event IDs:', interactedEventIds.size);

      const { data: eventsData } = await supabase
        .from("events")
        .select("*");

      console.log('DB events count:', eventsData?.length, eventsData?.slice(0,2));
      if (eventsData) {
        // Strong client-side dedupe by normalized (title|date|location)
        const seenKeys = new Set<string>();
        const uniqueEvents = (eventsData || []).filter((e: any) => {
          const key = `${(e.title||'').toLowerCase()}|${(e.date||'').slice(0,10)}|${(e.location||'').toLowerCase()}`;
          if (seenKeys.has(key)) return false;
          seenKeys.add(key);
          return true;
        });
        // Filter out events the user has already interacted with
        const uninteractedEvents = uniqueEvents
          .filter(event => !interactedEventIds.has(event.id))
          .filter(event => !(event.event_link || '').includes('example.com'));
        console.log('Uninteracted events:', uninteractedEvents.length);
        const userCityLower = profile?.city?.toLowerCase() || '';
        // Prefer city/online, but if none match, show all
        const preferred = uninteractedEvents.filter(event => {
          const eventLocation = (event.location || '').toLowerCase();
          return userCityLower && (eventLocation.includes(userCityLower) || eventLocation === 'online');
        });
        console.log('Preferred (city/online) events:', preferred.length);
        const pool = preferred.length > 0 ? preferred : uninteractedEvents;
        
        // Filter out events that do not match any of the user's selected interests
        const filteredByInterest = interests.length > 0
          ? pool.filter(ev => (ev.interests || []).some((i: string) => interestSet.has((i || '').toLowerCase())))
          : pool;
        console.log('Interest-matched events:', filteredByInterest.length, 'of', pool.length);
        
        // Rank by user preferences while preserving variety
        const { data: userInterests } = await supabase.from("user_interests").select("interest").eq("user_id", user.id);
        const { data: userVibes } = await supabase.from("user_vibes").select("vibe").eq("user_id", user.id);
        const interests = (userInterests || []).map((i: any) => (i.interest || '').toLowerCase());
        const vibes = (userVibes || []).map((v: any) => (v.vibe || '').toLowerCase());

        const interestSet = new Set(interests);
        const vibeSet = new Set(vibes);

        function preferenceScore(ev: any): number {
          const evInterests = (ev.interests || []).map((x: string) => (x || '').toLowerCase());
          const evVibes = (ev.vibes || []).map((x: string) => (x || '').toLowerCase());
          let score = 0;
          for (const i of evInterests) if (interestSet.has(i)) score += 3;
          for (const v of evVibes) if (vibeSet.has(v)) score += 1.5;
          // Recency/date proximity bonus
          const daysAway = Math.min(30, Math.max(0, (new Date(ev.date).getTime() - Date.now()) / (1000*60*60*24)));
          score += (30 - daysAway) * 0.05;
          return score;
        }

        // Sort by preference score, then date
        const ranked = [...filteredByInterest].sort((a, b) => {
          const sa = preferenceScore(a);
          const sb = preferenceScore(b);
          if (sb !== sa) return sb - sa;
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        });

        // Better shuffling: group by interest, shuffle each group, then interleave
        const byInterest = new Map<string, typeof ranked>();
        ranked.forEach(event => {
          const interest = event.interests?.[0] || 'General';
          if (!byInterest.has(interest)) byInterest.set(interest, []);
          byInterest.get(interest)!.push(event);
        });
        
        // Shuffle within each interest group
        byInterest.forEach((events, interest) => {
          byInterest.set(interest, events.sort(() => Math.random() - 0.5));
        });
        
        // Interleave events from different interests for variety
        const shuffled: typeof ranked = [];
        const interestArrays = Array.from(byInterest.values());
        let maxLength = Math.max(...interestArrays.map(arr => arr.length));
        
        for (let i = 0; i < maxLength; i++) {
          interestArrays.forEach(arr => {
            if (i < arr.length) shuffled.push(arr[i]);
          });
        }
        
        console.log('Shuffled with diversity:', shuffled.length, 'interests:', byInterest.size);
        setAllEvents(shuffled);

        // If no events exist yet, trigger an optimized discovery
        if (uninteractedEvents.length === 0 && !initialDiscoveryTriggeredRef.current) {
          initialDiscoveryTriggeredRef.current = true;
          console.log('No events available; triggering initial discovery...');
          
          try {
            setLoading(true);
            // Fetch user interests and vibes for personalized discovery
            const { data: userInterests } = await supabase.from("user_interests").select("interest").eq("user_id", user.id);
            const { data: userVibes } = await supabase.from("user_vibes").select("vibe").eq("user_id", user.id);
            const interests = (userInterests || []).map((i: any) => i.interest);
            const vibes = (userVibes || []).map((v: any) => v.vibe);
            console.log('Using user interests:', interests, 'vibes:', vibes);
            
            // Use optimized settings with user preferences
            const { data } = await supabase.functions.invoke('discover-events', { 
              body: { city: profile?.city || userCity, interests, vibes } 
            });
            console.log('Initial discovery response:', data);
            // Reload data with proper shuffling
            await loadData();
          } catch (e) {
            console.error('Initial discovery failed:', e);
          } finally {
            setLoading(false);
          }
        }
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };


  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleSaveEvent = async (event: Event) => {
    try {
      // Remove from local decks immediately so it disappears even at stack end
      setDisplayedEvents(prev => prev.filter(e => e.id !== event.id));
      setAllEvents(prev => prev.filter(e => e.id !== event.id));

      // First delete any existing record to ensure clean state
      await (supabase as any).from("event_attendance").delete().eq("user_id", currentUserId).eq("event_id", event.id);

      // Then insert fresh 'saved' record
      const { error } = await supabase.from("event_attendance").insert({
        user_id: currentUserId,
        event_id: event.id,
        status: "saved",
      });

      if (error) throw error;

      await supabase.from("event_interactions").insert({
        user_id: currentUserId,
        event_title: event.title,
        event_description: event.description,
        interaction_type: "saved",
      });

      toast({ title: "Event saved!" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const handleRemoveEvent = async (event: Event) => {
    try {
      // Remove from local decks immediately so it disappears even at stack end
      setDisplayedEvents(prev => prev.filter(e => e.id !== event.id));
      setAllEvents(prev => prev.filter(e => e.id !== event.id));

      // Delete any existing record first to ensure clean state
      await (supabase as any).from("event_attendance").delete().eq("user_id", currentUserId).eq("event_id", event.id);

      // Insert a "dismissed" record so it doesn't show again
      const { error } = await supabase.from("event_attendance").insert({
        user_id: currentUserId,
        event_id: event.id,
        status: "dismissed",
      });

      if (error) throw error;

      await supabase.from("event_interactions").insert({
        user_id: currentUserId,
        event_title: event.title,
        event_description: event.description,
        interaction_type: "removed",
      });

      toast({ title: "Event removed" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const handleSwipe = async (direction: string, event: Event) => {
    // Immediately remove from local state (both sources)
    setDisplayedEvents(prev => prev.filter(e => e.id !== event.id));
    setAllEvents(prev => prev.filter(e => e.id !== event.id));
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : 0));
    
    if (direction === "right") {
      await handleSaveEvent(event);
    } else if (direction === "left") {
      await handleRemoveEvent(event);
    }
  };


  const handleUndo = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const filteredEvents = useMemo(() => {
    const filtered = allEvents.filter((event) => {
      const eventDate = new Date(event.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (timeFilter === "today") {
        return eventDate.toDateString() === today.toDateString();
      } else {
        const weekFromNow = new Date(today);
        weekFromNow.setDate(today.getDate() + 7);
        return eventDate >= today && eventDate <= weekFromNow;
      }
    });
    if (filtered.length === 0 && allEvents.length > 0) {
      console.log('Filtered events: 0 — using fallback to all events');
      return allEvents;
    }
    console.log('Filtered events:', filtered.length);
    return filtered;
  }, [allEvents, timeFilter]);

  // Initialize displayed events when filtered events change
  useEffect(() => {
    if (filteredEvents.length > 0) {
      const initialBatch = filteredEvents.slice(0, BATCH_SIZE);
      console.log('Setting initial batch:', initialBatch.length);
      setDisplayedEvents(initialBatch);
      setCurrentIndex(0);
    } else {
      setDisplayedEvents([]);
    }
  }, [filteredEvents]);

  // If displayedEvents shrinks, keep currentIndex in range
  useEffect(() => {
    if (currentIndex >= displayedEvents.length) {
      const nextIndex = Math.max(0, displayedEvents.length - 1);
      if (nextIndex !== currentIndex) setCurrentIndex(nextIndex);
    }
  }, [displayedEvents.length, currentIndex]);

  // Safety: if displayed list is empty but we still have filtered events, re-seed the batch
  useEffect(() => {
    if (displayedEvents.length === 0 && filteredEvents.length > 0) {
      const initialBatch = filteredEvents.slice(0, BATCH_SIZE);
      setDisplayedEvents(initialBatch);
      setCurrentIndex(0);
    }
  }, [displayedEvents.length, filteredEvents]);

  // Auto-discover more events when running low (cooldown + single-flight)
  useEffect(() => {
    const autoDiscover = async () => {
      const now = Date.now();
      const cooldownMs = 15000; // 15 seconds for faster batched fetching
      const canRun = filteredEvents.length <= 5 && !isAutoDiscovering && (now - lastAutoDiscoverAtRef.current > cooldownMs);
      if (!canRun) return;

      console.log('Running low on events, discovering more in background...');
      setIsAutoDiscovering(true);
      setIsBackgroundDiscovering(true);
      try {
        // NO setLoading(true) - keep UI responsive!
        
        // Fetch user interests and vibes for personalized discovery
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        const { data: userInterests } = await supabase.from("user_interests").select("interest").eq("user_id", user.id);
        const { data: userVibes } = await supabase.from("user_vibes").select("vibe").eq("user_id", user.id);
        const interests = (userInterests || []).map((i: any) => i.interest);
        const vibes = (userVibes || []).map((v: any) => v.vibe);
        
        // Use optimized settings with user preferences
        const { data } = await supabase.functions.invoke('discover-events', { body: { city: userCity, interests, vibes } });
        console.log('Background discovery complete:', data);
        
        // Silently reload data without blocking UI
        await loadData();
        
        toast({ 
          title: "New events discovered!", 
          description: `Found ${data?.events?.length || 0} more events` 
        });
      } catch (error: any) {
        console.error('Background discovery failed:', error);
      } finally {
        lastAutoDiscoverAtRef.current = Date.now();
        setIsAutoDiscovering(false);
        setIsBackgroundDiscovering(false);
      }
    };

    autoDiscover();
  }, [filteredEvents.length, isAutoDiscovering, userCity]);

  // Load more events as user swipes
  useEffect(() => {
    if (filteredEvents.length === 0) return;
    
    const remaining = filteredEvents.length - currentIndex;
    if (remaining < 5 && displayedEvents.length < filteredEvents.length) {
      const nextBatch = filteredEvents.slice(
        displayedEvents.length,
        displayedEvents.length + BATCH_SIZE
      );
      console.log('Loading next batch:', nextBatch.length);
      setDisplayedEvents(prev => [...prev, ...nextBatch]);
    }
  }, [currentIndex, filteredEvents, displayedEvents.length]);

  const visibleCards = useMemo(() => {
    const cards = displayedEvents.slice(currentIndex, currentIndex + 3);
    console.log('Visible cards:', cards.length, 'at index', currentIndex);
    return cards;
  }, [displayedEvents, currentIndex]);

  // If deck becomes empty, trigger immediate background discover (no cooldown)
  useEffect(() => {
    const run = async () => {
      if (loading) return;
      if (visibleCards.length > 0) return;
      if (isAutoDiscovering) return;
      try {
        setIsAutoDiscovering(true);
        setIsBackgroundDiscovering(true);
        setShowScrapingPanel(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: userInterests } = await supabase.from("user_interests").select("interest").eq("user_id", user.id);
        const { data: userVibes } = await supabase.from("user_vibes").select("vibe").eq("user_id", user.id);
        const interests = (userInterests || []).map((i: any) => i.interest);
        const vibes = (userVibes || []).map((v: any) => v.vibe);
        await supabase.functions.invoke('discover-events', { body: { city: userCity, interests, vibes } });
        await loadData();
      } catch (e) {
        console.error('Auto-discover on empty deck failed:', e);
      } finally {
        lastAutoDiscoverAtRef.current = Date.now();
        setIsAutoDiscovering(false);
        setIsBackgroundDiscovering(false);
      }
    };
    run();
  }, [visibleCards.length, loading, isAutoDiscovering, userCity]);

  if (loading) {
    const stepLabel = discoveryStep === 'start' ? 'Starting discovery' :
      discoveryStep === 'search' ? 'Finding event sites' :
      discoveryStep === 'listings' ? 'Scanning listings' :
      discoveryStep === 'events' ? 'Extracting events' : 'Preparing results';
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <div className="container mx-auto px-4 py-10">
          <div className="mx-auto max-w-2xl text-center mb-6">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <h2 className="text-2xl font-semibold">Discovering events for you</h2>
            <p className="text-muted-foreground mt-1">{stepLabel}…</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border bg-card p-3 shadow-sm">
                <div className="text-xs text-muted-foreground">Sites found</div>
                <div className="text-lg font-semibold">{discoveryCounts.braveSites}</div>
              </div>
              <div className="rounded-md border bg-card p-3 shadow-sm">
                <div className="text-xs text-muted-foreground">Event links</div>
                <div className="text-lg font-semibold">{discoveryCounts.eventLinks}</div>
              </div>
              <div className="rounded-md border bg-card p-3 shadow-sm">
                <div className="text-xs text-muted-foreground">Candidates</div>
                <div className="text-lg font-semibold">{discoveryCounts.candidatePages}</div>
              </div>
              <div className="rounded-md border bg-card p-3 shadow-sm">
                <div className="text-xs text-muted-foreground">Events extracted</div>
                <div className="text-lg font-semibold">{discoveryCounts.extractedEvents}</div>
              </div>
            </div>
          </div>
          {/* Live scraping panel */}
          <ScrapingStatusPanel sites={scrapedSites} isVisible={true} />
        </div>
      </div>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gradient-subtle">
        {/* Header */}
        <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm">
          <div className="container mx-auto flex items-center justify-between px-4 py-4">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-glow">
                <img src={logoIcon} alt="SpotOn" className="h-8 w-8" />
              </div>
              <span className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                SpotOn
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/saved")}
                className="hover:bg-secondary"
              >
                <Bookmark className="h-4 w-4 mr-2" />
                Saved
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/attended")}
                className="hover:bg-secondary"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Attended
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/search")}
                className="hover:bg-secondary relative"
              >
                <Users className="h-5 w-5" />
                {pendingConnectionsCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                    {pendingConnectionsCount}
                  </span>
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(`/profile/${currentUserId}`)}
                className="hover:bg-secondary"
              >
                <User className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/settings")}
                className="hover:bg-secondary"
              >
                <Settings className="h-5 w-5" />
              </Button>
              <Button variant="outline" onClick={handleSignOut}>
                Sign Out
              </Button>
            </div>
          </div>
        </header>

        <div className="container mx-auto px-4 py-8">
          {/* Filter Section */}
          <div className="mb-8">
            <div className="mb-4 flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span className="text-sm">{userCity}</span>
            </div>
            <div className="flex items-center justify-between">
              <h1 className="text-4xl font-bold">Discover Events</h1>
              <Button
                onClick={async () => {
                  setLoading(true);
                  setShowScrapingPanel(true);
                  setScrapedSites([]);
                  try {
                    // Fetch user interests and vibes for personalized discovery
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) return;
                    
                    const { data: userInterests } = await supabase.from("user_interests").select("interest").eq("user_id", user.id);
                    const { data: userVibes } = await supabase.from("user_vibes").select("vibe").eq("user_id", user.id);
                    const interests = (userInterests || []).map((i: any) => i.interest);
                    const vibes = (userVibes || []).map((v: any) => v.vibe);
                    console.log('Discovering with interests:', interests, 'vibes:', vibes);
                    
                    // Use optimized settings with user preferences
                    const { data, error } = await supabase.functions.invoke('discover-events', {
                      body: { city: userCity, interests, vibes }
                    });
                    
                    if (error) throw error;
                    
                    if (data.scrapingStatus) {
                      setScrapedSites(data.scrapingStatus);
                    }
                    
                    const message = data.eventsCount > 0 
                      ? `Added ${data.eventsCount} new events! (${data.totalEvents} total in database)`
                      : data.existingCount > 0 
                        ? `No new events found - all ${data.existingCount} discovered events already exist`
                        : data.message;
                    
                    toast({
                      title: data.eventsCount > 0 ? "New events discovered!" : "Discovery complete",
                      description: message,
                    });
                    
                    await loadData();
                  } catch (error: any) {
                    toast({
                      variant: "destructive",
                      title: "Error",
                      description: error.message,
                    });
                  } finally {
                    setLoading(false);
                  }
                }}
                className="gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Discover New Events
              </Button>
            </div>
          </div>

          {/* Scraping Status Panel */}
          <ScrapingStatusPanel sites={scrapedSites} isVisible={showScrapingPanel} />

          {/* Swipe Cards */}
          <div className="relative mx-auto max-w-md">
            <div className="relative h-[480px] w-full">
              {visibleCards.length > 0 ? (
                <>
                  {visibleCards.map((event, index) => (
                    <TinderCard
                      key={event.id}
                      onSwipe={(dir) => {
                        console.log('Swiped', dir, event.title);
                        handleSwipe(dir, event);
                      }}
                      preventSwipe={["up", "down"]}
                      className="absolute inset-0"
                      swipeRequirementType="position"
                      swipeThreshold={100}
                    >
                      <SwipeableEventCard
                        event={event}
                      />
                    </TinderCard>
                  ))}
                </>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                      <Sparkles className="h-10 w-10 text-muted-foreground animate-pulse" />
                    </div>
                    <h2 className="mb-2 text-2xl font-semibold transition-all duration-500">
                      {loadingMessages[currentMessageIndex]}
                    </h2>
                    <p className="text-muted-foreground">
                      Finding new experiences for you
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                className="h-16 w-16 rounded-full border-2"
                onClick={() => {
                  const currentEvent = visibleCards[0];
                  if (currentEvent) {
                    handleSwipe("left", currentEvent);
                  }
                }}
                disabled={visibleCards.length === 0}
              >
                <X className="h-8 w-8 text-destructive" />
              </Button>
              
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12 rounded-full"
                onClick={handleUndo}
                disabled={currentIndex === 0}
              >
                <RotateCcw className="h-6 w-6" />
              </Button>

              <Button
                variant="outline"
                size="icon"
                className="h-16 w-16 rounded-full border-2"
                onClick={() => {
                  const currentEvent = visibleCards[0];
                  if (currentEvent) {
                    handleSwipe("right", currentEvent);
                  }
                }}
                disabled={visibleCards.length === 0}
              >
                <Heart className="h-8 w-8 text-primary" />
              </Button>
            </div>

            {/* Swipe Instructions */}
            <div className="mt-6 text-center text-sm text-muted-foreground">
              <p>Swipe right to save • Swipe left to pass</p>
            </div>
          </div>
        </div>

        <EventDetailDialog
          event={selectedEvent}
          open={isDetailDialogOpen}
          onOpenChange={setIsDetailDialogOpen}
        />
      </div>
    </AuthGuard>
  );
}
