import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AuthGuard } from "@/components/AuthGuard";
import { EventDetailDialog } from "@/components/EventDetailDialog";
import { ScrapingStatusPanel } from "@/components/ScrapingStatusPanel";
import { SwipeableEventCard } from "@/components/SwipeableEventCard";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings, MapPin, Sparkles, User, Search, Bookmark, CheckCircle, Heart, X, RotateCcw, Users, Filter } from "lucide-react";
import logoIcon from "@/assets/logo-icon.png";
import { useToast } from "@/hooks/use-toast";
import TinderCard from "react-tinder-card";
import type { Event } from "@/types/event";
import { eventAttendanceService } from "@/services/eventAttendanceService";
import { cn } from "@/lib/utils";

type AttendanceStatus = "suggested" | "will_attend" | "attended" | null;

const BATCH_SIZE = 10;
const FILTER_STORAGE_KEY = "spoton_discover_filters_v1";

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
  const [availableInterests, setAvailableInterests] = useState<string[]>([]);
  const [interestFilter, setInterestFilter] = useState<string[]>([]);
  const [isInterestPopoverOpen, setIsInterestPopoverOpen] = useState(false);
  const [isProgressOpen, setIsProgressOpen] = useState(false);
  const lastAutoDiscoverAtRef = useRef<number>(0);
  const initialDiscoveryTriggeredRef = useRef<boolean>(false);
  
  const currentIndexRef = useRef(currentIndex);
  const currentCardFocusRef = useRef<HTMLDivElement | null>(null);
  const liveRegionRef = useRef<HTMLDivElement | null>(null);
  const CARD_INSTRUCTIONS_ID = "discover-card-instructions";

  // Load persisted filters on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.timeFilter === "today" || parsed?.timeFilter === "this_week") {
        setTimeFilter(parsed.timeFilter);
      }
      if (Array.isArray(parsed?.interests)) {
        setInterestFilter(parsed.interests.filter((v: unknown): v is string => typeof v === "string"));
      }
    } catch (error) {
      console.warn("Failed to load discover filters", error);
    }
  }, []);

  // Persist filters whenever they change
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({ timeFilter, interests: interestFilter })
      );
    } catch (error) {
      console.warn("Failed to persist discover filters", error);
    }
  }, [timeFilter, interestFilter]);

  useEffect(() => {
    if (availableInterests.length === 0) return;
    setInterestFilter((prev) => {
      const filtered = prev.filter((interest) => availableInterests.includes(interest));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [availableInterests]);

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

      // Get user's event interactions to filter them out (using canonical_key for deduplication)
      const { data: attendanceData } = await supabase
        .from("event_attendance")
        .select("event_id, canonical_key")
        .eq("user_id", user.id);

      const interactedEventIds = new Set(attendanceData?.map(a => a.event_id) || []);
      const interactedCanonicalKeys = new Set(
        attendanceData?.filter(a => a.canonical_key).map(a => a.canonical_key) || []
      );
      console.log('Interacted event IDs:', interactedEventIds.size, 'canonical keys:', interactedCanonicalKeys.size);

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
        // Filter out events the user has already interacted with (by ID or canonical_key)
        const uninteractedEvents = uniqueEvents
          .filter(event => !interactedEventIds.has(event.id) && !interactedCanonicalKeys.has(event.canonical_key))
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
        
        // Load user prefs and build sets for filtering/ranking
        const { data: userInterests } = await supabase.from("user_interests").select("interest").eq("user_id", user.id);
        const rawInterests = (userInterests || [])
          .map((i: any) => i?.interest)
          .filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0);
        const dedupedRawInterests = Array.from(new Set(rawInterests)).sort((a, b) => a.localeCompare(b));
        setAvailableInterests(dedupedRawInterests);
        const interests = dedupedRawInterests.map((interest) => interest.toLowerCase());
        const interestSet = new Set(interests);

        // Filter out events that do not match any of the user's selected interests
        const filteredByInterest = interests.length > 0
          ? pool.filter(ev => (ev.interests || []).some((i: string) => interestSet.has((i || '').toLowerCase())))
          : pool;
        console.log('Interest-matched events:', filteredByInterest.length, 'of', pool.length);

        function preferenceScore(ev: any): number {
          const evInterests = (ev.interests || []).map((x: string) => (x || '').toLowerCase());
          let score = 0;
          for (const i of evInterests) if (interestSet.has(i)) score += 3;
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
        
        // Deduplicate by event.id to avoid duplicate keys in React lists
        const seenIds = new Set<string>();
        const deduped = shuffled.filter((e: any) => {
          if (!e?.id) return true;
          if (seenIds.has(e.id)) return false;
          seenIds.add(e.id);
          return true;
        });
        console.log('Shuffled with diversity:', deduped.length, 'interests:', byInterest.size);
        setAllEvents(deduped);

        // If no events exist yet, trigger an optimized discovery
        if (uninteractedEvents.length === 0 && !initialDiscoveryTriggeredRef.current) {
          initialDiscoveryTriggeredRef.current = true;
          console.log('No events available; triggering initial discovery...');
          
          try {
            setLoading(true);
            // Fetch user interests for personalized discovery
            const { data: userInterests } = await supabase.from("user_interests").select("interest").eq("user_id", user.id);
            const interests = (userInterests || []).map((i: any) => i.interest);
            console.log('Using user interests:', interests);
            
            // Use optimized settings with user preferences
            const { data } = await supabase.functions.invoke('discover-events', { 
              body: { city: profile?.city || userCity, interests } 
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

      // Use the consolidated service
      await eventAttendanceService.saveEvent(currentUserId, event.id, event.canonical_key);
      await eventAttendanceService.logInteraction(currentUserId, event.title, "saved");

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

      // Use the consolidated service
      await eventAttendanceService.dismissEvent(currentUserId, event.id, event.canonical_key);
      await eventAttendanceService.logInteraction(currentUserId, event.title, "dismissed");

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
    setDisplayedEvents(prev => {
      const filtered = prev.filter(e => e.id !== event.id);
      // Adjust currentIndex if we're at or past the end
      setCurrentIndex(curr => {
        if (curr >= filtered.length && filtered.length > 0) {
          return filtered.length - 1;
        }
        return curr > 0 ? curr - 1 : 0;
      });
      return filtered;
    });
    setAllEvents(prev => prev.filter(e => e.id !== event.id));
    
    if (direction === "right") {
      await handleSaveEvent(event);
    } else if (direction === "left") {
      await handleRemoveEvent(event);
    }
  };

  const handleViewDetails = (event: Event) => {
    setSelectedEvent(event);
    setIsDetailDialogOpen(true);
  };


  const handleUndo = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const filteredEvents = useMemo(() => {
    const interestFilterSet = interestFilter.length > 0
      ? new Set(interestFilter.map((interest) => interest.toLowerCase()))
      : null;

    const timeFiltered = allEvents.filter((event) => {
      const eventDate = new Date(event.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (timeFilter === "today") {
        return eventDate.toDateString() === today.toDateString();
      }

      const weekFromNow = new Date(today);
      weekFromNow.setDate(today.getDate() + 7);
      return eventDate >= today && eventDate <= weekFromNow;
    });

    const interestFiltered = interestFilterSet
      ? timeFiltered.filter((event) =>
          (event.interests || []).some((interest) => interestFilterSet.has((interest || '').toLowerCase()))
        )
      : timeFiltered;

    console.log('Filtered events:', interestFiltered.length, 'timeFilter:', timeFilter, 'interestFilter:', interestFilterSet ? Array.from(interestFilterSet) : 'all');
    return interestFiltered;
  }, [allEvents, timeFilter, interestFilter]);

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

  const visibleCards = useMemo(() => {
    const cards = displayedEvents.slice(currentIndex, currentIndex + 3);
    console.log('Visible cards:', cards.length, 'at index', currentIndex);
    return cards;
  }, [displayedEvents, currentIndex]);

  useEffect(() => {
    if (visibleCards.length > 0 && currentCardFocusRef.current) {
      currentCardFocusRef.current.focus();
    }
  }, [visibleCards]);

  useEffect(() => {
    if (visibleCards.length === 0) {
      currentCardFocusRef.current = null;
    }
  }, [visibleCards.length]);

  useEffect(() => {
    if (!isDetailDialogOpen && visibleCards.length > 0 && currentCardFocusRef.current) {
      currentCardFocusRef.current.focus();
    }
  }, [isDetailDialogOpen, visibleCards.length]);

  useEffect(() => {
    if (!liveRegionRef.current) return;
    if (displayedEvents.length === 0) {
      liveRegionRef.current.textContent = "No events currently available. Activate Discover New Events to find more.";
      return;
    }
    const total = displayedEvents.length;
    const position = Math.min(currentIndex + 1, total);
    liveRegionRef.current.textContent = `Showing ${total} events. Currently focused on event ${position}.`;
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
        
        // Fetch user interests for personalized discovery
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        const { data: userInterests } = await supabase.from("user_interests").select("interest").eq("user_id", user.id);
        const interests = (userInterests || []).map((i: any) => i.interest);
        
        // Use optimized settings with user preferences
        const { data } = await supabase.functions.invoke('discover-events', { body: { city: userCity, interests } });
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
    if (filteredEvents.length === 0 || displayedEvents.length === 0) return;
    
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
        const interests = (userInterests || []).map((i: any) => i.interest);
        await supabase.functions.invoke('discover-events', { body: { city: userCity, interests } });
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
            <div
              role="status"
              aria-live="polite"
              className="sr-only"
            >
              {`Discovering events for you. ${stepLabel}. ${discoveryCounts.extractedEvents} events extracted so far.`}
            </div>
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
      <main id="main-content" className="min-h-screen bg-gradient-subtle" aria-label="Discover events">
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
          <div
            ref={liveRegionRef}
            className="sr-only"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          />
          <p id={CARD_INSTRUCTIONS_ID} className="sr-only">
            Use the left arrow key or the A key to remove an event, the right arrow key or the D key to save an event, and press Enter or Space to open event details.
          </p>
          {/* Filter Section */}
          <div className="mb-8 space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              <span className="text-sm">{userCity}</span>
            </div>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <h1 className="text-4xl font-bold">Discover Events</h1>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-full border border-border bg-card p-1">
                  {(["today", "this_week"] as const).map((value) => (
                    <Button
                      key={value}
                      type="button"
                      variant={timeFilter === value ? "default" : "outline"}
                      className={cn("h-9 px-4", timeFilter === value ? "bg-primary text-primary-foreground" : "")}
                      onClick={() => setTimeFilter(value)}
                      aria-pressed={timeFilter === value}
                    >
                      {value === "today" ? "Today" : "This Week"}
                    </Button>
                  ))}
                </div>

                <Popover open={isInterestPopoverOpen} onOpenChange={setIsInterestPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="gap-2" aria-expanded={isInterestPopoverOpen}>
                      <Filter className="h-4 w-4" aria-hidden="true" />
                      {interestFilter.length > 0 ? `${interestFilter.length} interest${interestFilter.length > 1 ? 's' : ''}` : "All interests"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64" align="end">
                    <div className="mb-2 flex items-center justify-between text-sm font-medium">
                      <span>Filter interests</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setInterestFilter([])}
                        disabled={interestFilter.length === 0}
                      >
                        Clear
                      </Button>
                    </div>
                    {availableInterests.length > 0 ? (
                      <ScrollArea className="max-h-56 pr-2">
                        <div className="space-y-1">
                          {availableInterests.map((interest) => {
                            const checked = interestFilter.includes(interest);
                            return (
                              <label
                                key={interest}
                                htmlFor={`interest-filter-${interest}`}
                                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted"
                              >
                                <Checkbox
                                  id={`interest-filter-${interest}`}
                                  checked={checked}
                                  onCheckedChange={(state) => {
                                    const isChecked = state === true;
                                    setInterestFilter((prev) => {
                                      if (isChecked) {
                                        if (prev.includes(interest)) return prev;
                                        return [...prev, interest];
                                      }
                                      return prev.filter((value) => value !== interest);
                                    });
                                  }}
                                />
                                <span>{interest}</span>
                              </label>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    ) : (
                      <p className="text-sm text-muted-foreground">No saved interests yet.</p>
                    )}
                  </PopoverContent>
                </Popover>

                <Button
                  variant="outline"
                  className="lg:hidden"
                  onClick={() => setIsProgressOpen(true)}
                  aria-label="View discovery progress"
                  disabled={!showScrapingPanel && scrapedSites.length === 0}
                >
                  Progress
                </Button>

                <Button
                  onClick={async () => {
                    setLoading(true);
                    setShowScrapingPanel(true);
                    setScrapedSites([]);
                    try {
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user) return;

                      const { data: userInterests } = await supabase.from("user_interests").select("interest").eq("user_id", user.id);
                      const interests = (userInterests || []).map((i: any) => i.interest);
                      console.log('Discovering with interests:', interests);

                      const { data, error } = await supabase.functions.invoke('discover-events', {
                        body: { city: userCity, interests }
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
                  aria-label="Discover new events based on your interests"
                  aria-busy={loading}
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  Discover New Events
                </Button>
              </div>
            </div>
          </div>

          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
            <div className="relative mx-auto max-w-md lg:mx-0" role="region" aria-label="Event cards">
              <div className="relative h-[480px] w-full" aria-live="polite" aria-atomic="true">
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
                          ref={(node) => {
                            if (index === 0) {
                              currentCardFocusRef.current = node;
                            }
                          }}
                          event={event}
                          isActive={index === 0}
                          onSave={() => handleSwipe("right", event)}
                          onDismiss={() => handleSwipe("left", event)}
                          onViewDetails={() => handleViewDetails(event)}
                          instructionsId={CARD_INSTRUCTIONS_ID}
                        />
                      </TinderCard>
                    ))}
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    {(loading || isBackgroundDiscovering) ? (
                      <div className="flex w-full flex-col gap-4">
                        {Array.from({ length: 2 }).map((_, idx) => (
                          <div key={idx} className="relative h-[440px] w-full overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
                            <Skeleton className="h-28 w-full" />
                            <div className="space-y-4 p-6">
                              <Skeleton className="h-5 w-3/4" />
                              <Skeleton className="h-4 w-full" />
                              <Skeleton className="h-4 w-5/6" />
                              <div className="space-y-2">
                                <Skeleton className="h-4 w-40" />
                                <Skeleton className="h-4 w-24" />
                              </div>
                              <div className="flex gap-2">
                                <Skeleton className="h-6 w-16" />
                                <Skeleton className="h-6 w-20" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : filteredEvents.length === 0 && (interestFilter.length > 0 || allEvents.length > 0) ? (
                      <div className="text-center">
                        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                          <Sparkles className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
                        </div>
                        <h2 className="mb-2 text-2xl font-semibold">No events match your filters</h2>
                        <p className="text-muted-foreground">Try adjusting your time range or interest filters.</p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                          <Sparkles className="h-10 w-10 text-muted-foreground animate-pulse" aria-hidden="true" />
                        </div>
                        <h2 className="mb-2 text-2xl font-semibold transition-all duration-500">
                          {loadingMessages[currentMessageIndex]}
                        </h2>
                        <p className="text-muted-foreground">
                          Finding new experiences for you
                        </p>
                      </div>
                    )}
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
                  aria-label="Remove current event"
                >
                  <X className="h-8 w-8 text-destructive" aria-hidden="true" />
                </Button>
                
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 rounded-full"
                  onClick={handleUndo}
                  disabled={currentIndex === 0}
                  aria-label="Undo last action"
                >
                  <RotateCcw className="h-6 w-6" aria-hidden="true" />
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
                  aria-label="Save current event"
                >
                  <Heart className="h-8 w-8 text-primary" aria-hidden="true" />
                </Button>
              </div>

              {/* Swipe Instructions */}
              <div className="mt-6 text-center text-sm text-muted-foreground">
                <p>Swipe right to save • Swipe left to pass</p>
              </div>
            </div>

            <aside className="mt-8 hidden lg:block">
              <ScrapingStatusPanel sites={scrapedSites} isVisible={showScrapingPanel} />
            </aside>
          </div>
        </div>

        <Sheet open={isProgressOpen} onOpenChange={setIsProgressOpen}>
          <SheetContent side="right" className="w-full sm:w-[380px]">
            <SheetHeader>
              <SheetTitle>Discovery progress</SheetTitle>
            </SheetHeader>
            <ScrapingStatusPanel sites={scrapedSites} isVisible={true} />
          </SheetContent>
        </Sheet>

        <EventDetailDialog
          event={selectedEvent}
          open={isDetailDialogOpen}
          onOpenChange={setIsDetailDialogOpen}
        />
      </main>
    </AuthGuard>
  );
}
