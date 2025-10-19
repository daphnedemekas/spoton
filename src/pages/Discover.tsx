import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AuthGuard } from "@/components/AuthGuard";
import { EventDetailDialog } from "@/components/EventDetailDialog";
import { Settings, Calendar, MapPin, Sparkles, User, Search, Bookmark, CheckCircle, Heart, X, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

type AttendanceStatus = "suggested" | "saved" | "attended" | null;

export default function Discover() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [timeFilter, setTimeFilter] = useState<"today" | "this_week">("this_week");
  const [userCity, setUserCity] = useState("");
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceStatus>>({});
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

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

      // Load events
      const { data: eventsData } = await supabase
        .from("events")
        .select("*")
        .order("date", { ascending: true });

      if (eventsData) {
        setEvents(eventsData);
      }

      // Load user's attendance
      const { data: attendanceData } = await supabase
        .from("event_attendance")
        .select("event_id, status")
        .eq("user_id", user.id);

      if (attendanceData) {
        const map: Record<string, AttendanceStatus> = {};
        attendanceData.forEach((item) => {
          map[item.event_id] = item.status as AttendanceStatus;
        });
        setAttendanceMap(map);
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
      const { error } = await supabase
        .from("event_attendance")
        .upsert({
          user_id: currentUserId,
          event_id: event.id,
          status: "saved",
        });

      if (error) throw error;

      // Track save
      await supabase.from("event_interactions").insert({
        user_id: currentUserId,
        event_title: event.title,
        event_description: event.description,
        interaction_type: "saved",
      });

      setAttendanceMap((prev) => ({ ...prev, [event.id]: "saved" }));
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
      // Remove from attendance
      await supabase
        .from("event_attendance")
        .delete()
        .eq("user_id", currentUserId)
        .eq("event_id", event.id);

      // Track removal
      await supabase.from("event_interactions").insert({
        user_id: currentUserId,
        event_title: event.title,
        event_description: event.description,
        interaction_type: "removed",
      });

      setAttendanceMap((prev) => ({ ...prev, [event.id]: null }));
      
      // Remove from display
      setEvents((prev) => prev.filter((e) => e.id !== event.id));
      
      toast({ title: "Event removed" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const filteredEvents = events.filter((event) => {
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
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
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
                className="hover:bg-secondary"
              >
                <Search className="h-5 w-5" />
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
                  try {
                    const { data, error } = await supabase.functions.invoke('discover-events', {
                      body: { userId: currentUserId }
                    });
                    
                    if (error) throw error;
                    
                    toast({
                      title: "Events discovered!",
                      description: data.message,
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
            <div className="mt-6 flex gap-3">
              <Button
                variant={timeFilter === "today" ? "default" : "outline"}
                onClick={() => setTimeFilter("today")}
                className="gap-2"
              >
                <Calendar className="h-4 w-4" />
                Today
              </Button>
              <Button
                variant={timeFilter === "this_week" ? "default" : "outline"}
                onClick={() => setTimeFilter("this_week")}
                className="gap-2"
              >
                <Calendar className="h-4 w-4" />
                This Week
              </Button>
            </div>
          </div>

          {/* Events Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredEvents.map((event) => {
              const status = attendanceMap[event.id];
              return (
                <Card
                  key={event.id}
                  className="group overflow-hidden border-border/50 shadow-card transition-all hover:scale-[1.02] hover:shadow-glow cursor-pointer"
                  onClick={() => {
                    setSelectedEvent(event);
                    setIsDetailDialogOpen(true);
                  }}
                >
                  <div className="p-6">
                    {event.image_url && (
                      <div className="relative -mx-6 -mt-6 mb-4 aspect-video w-[calc(100%+3rem)] overflow-hidden bg-muted">
                        <img
                          src={event.image_url}
                          alt={event.title}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                    <div className="mb-4">
                      <h3 className="mb-2 text-xl font-semibold group-hover:text-primary transition-colors">
                        {event.title}
                      </h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">{event.description}</p>
                    </div>

                    <div className="mb-4 space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>{new Date(event.date).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        <span>{event.location}</span>
                      </div>
                    </div>

                    <div className="mb-4 space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {event.vibes.map((v) => (
                          <Badge key={v} variant="secondary" className="text-xs">
                            {v}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {event.interests.map((i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {i}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant={status === "saved" ? "default" : "outline"}
                        size="icon"
                        onClick={() => handleSaveEvent(event)}
                        disabled={status === "saved"}
                        className="flex-1"
                      >
                        <Heart className={`h-4 w-4 ${status === "saved" ? "fill-current" : ""}`} />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleRemoveEvent(event)}
                        className="flex-1"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      {event.event_link && (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => window.open(event.event_link, '_blank')}
                          className="flex-1"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {filteredEvents.length === 0 && (
            <div className="mt-12 text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                <Calendar className="h-10 w-10 text-muted-foreground" />
              </div>
              <h2 className="mb-2 text-2xl font-semibold">No events found</h2>
              <p className="text-muted-foreground">
                Try adjusting your time filter or check back later
              </p>
            </div>
          )}
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
