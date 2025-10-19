import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AuthGuard } from "@/components/AuthGuard";
import { Settings, Calendar, MapPin, Sparkles, User, Check, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Event = {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  vibes: string[];
  interests: string[];
};

type AttendanceStatus = "suggested" | "will_attend" | "attended" | null;

export default function Discover() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [timeFilter, setTimeFilter] = useState<"today" | "this_week">("this_week");
  const [userCity, setUserCity] = useState("");
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceStatus>>({});
  const [currentUserId, setCurrentUserId] = useState<string>("");

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

  const handleAttendanceUpdate = async (eventId: string, newStatus: "will_attend" | "attended") => {
    try {
      const currentStatus = attendanceMap[eventId];

      if (currentStatus === newStatus) {
        // Remove attendance if clicking the same status
        await supabase
          .from("event_attendance")
          .delete()
          .eq("user_id", currentUserId)
          .eq("event_id", eventId);

        setAttendanceMap((prev) => ({ ...prev, [eventId]: null }));
        toast({ title: "Status removed" });
      } else {
        // Update or insert attendance
        const { error } = await supabase
          .from("event_attendance")
          .upsert({
            user_id: currentUserId,
            event_id: eventId,
            status: newStatus,
          });

        if (error) throw error;

        setAttendanceMap((prev) => ({ ...prev, [eventId]: newStatus }));
        toast({ title: `Marked as ${newStatus === "will_attend" ? "Will Attend" : "Attended"}` });
      }
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
                Vibe Finder
              </span>
            </div>
            <div className="flex items-center gap-3">
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
            <h1 className="mb-6 text-4xl font-bold">Discover Events</h1>
            <div className="flex gap-3">
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
                  className="group overflow-hidden border-border/50 shadow-card transition-all hover:scale-[1.02] hover:shadow-glow"
                >
                  <div className="p-6">
                    <div className="mb-4">
                      <h3 className="mb-2 text-xl font-semibold group-hover:text-primary transition-colors">
                        {event.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">{event.description}</p>
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

                    {/* Attendance Buttons */}
                    <div className="flex gap-2">
                      <Button
                        variant={status === "will_attend" ? "default" : "outline"}
                        size="sm"
                        className="flex-1"
                        onClick={() => handleAttendanceUpdate(event.id, "will_attend")}
                      >
                        {status === "will_attend" && <Check className="mr-1 h-4 w-4" />}
                        Will Attend
                      </Button>
                      <Button
                        variant={status === "attended" ? "default" : "outline"}
                        size="sm"
                        className="flex-1"
                        onClick={() => handleAttendanceUpdate(event.id, "attended")}
                      >
                        {status === "attended" && <Check className="mr-1 h-4 w-4" />}
                        Attended
                      </Button>
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
      </div>
    </AuthGuard>
  );
}
