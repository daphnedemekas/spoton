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
  const [pendingConnectionsCount, setPendingConnectionsCount] = useState(0);
  const [loadingMessages, setLoadingMessages] = useState<string[]>([
    "Finding your perfect events...",
    "Discovering amazing experiences...",
    "Curating events just for you...",
  ]);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  
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
      }

      // Get user's event interactions to filter them out
      const { data: attendanceData } = await supabase
        .from("event_attendance")
        .select("event_id")
        .eq("user_id", user.id);

      const interactedEventIds = new Set(attendanceData?.map(a => a.event_id) || []);

      const { data: eventsData } = await supabase
        .from("events")
        .select("*");

      if (eventsData) {
        // Filter out events the user has already interacted with
        const uninteractedEvents = eventsData.filter(event => !interactedEventIds.has(event.id));
        // Filter by location - only show events in user's city or online events
        const locationFiltered = uninteractedEvents.filter(event => {
          const eventLocation = event.location.toLowerCase();
          const userCityLower = profile?.city.toLowerCase() || '';
          return eventLocation.includes(userCityLower) || eventLocation === 'online';
        });
        // Shuffle events for random order
        const shuffled = [...locationFiltered].sort(() => Math.random() - 0.5);
        setAllEvents(shuffled);
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
      // First delete any existing record to ensure clean state
      await supabase.from("event_attendance").delete()
        .eq("user_id", currentUserId)
        .eq("event_id", event.id);

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
      await supabase.from("event_attendance").delete()
        .eq("user_id", currentUserId)
        .eq("event_id", event.id);

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
    // Immediately remove from local state
    setAllEvents(prev => prev.filter(e => e.id !== event.id));
    setCurrentIndex(prev => prev); // Keep same index to show next card
    
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

  // Auto-discover more events when running low
  useEffect(() => {
    const autoDiscover = async () => {
      // Trigger discovery when we're down to 5 or fewer events
      if (filteredEvents.length <= 5 && !loading) {
        console.log('Running low on events, auto-discovering more...');
        setLoading(true);
        try {
          const { data, error } = await supabase.functions.invoke('discover-events', {
            body: {}
          });
          
          if (error) throw error;
          
          console.log('Auto-discovery complete:', data);
          await loadData();
        } catch (error: any) {
          console.error('Auto-discovery failed:', error);
        } finally {
          setLoading(false);
        }
      }
    };

    autoDiscover();
  }, [filteredEvents.length, loading]);

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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-subtle">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
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
                    const { data, error } = await supabase.functions.invoke('discover-events', {
                      body: {} // Auth is handled via JWT in Authorization header
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
