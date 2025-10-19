import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AuthGuard } from "@/components/AuthGuard";
import { Settings, Calendar, MapPin, Sparkles } from "lucide-react";

// Mock event data for demonstration
const MOCK_EVENTS = [
  {
    id: "1",
    title: "Sunset Yoga in the Park",
    description: "Join us for a peaceful outdoor yoga session as the sun sets",
    date: "2025-10-20",
    location: "Golden Gate Park",
    vibe: ["Peaceful", "Recurring"],
    interests: ["Yoga", "Meditation"],
  },
  {
    id: "2",
    title: "Live Jazz Night",
    description: "Experience incredible live jazz performances from local artists",
    date: "2025-10-19",
    location: "The Blue Note",
    vibe: ["Epic", "Exciting"],
    interests: ["Music"],
  },
  {
    id: "3",
    title: "Art Gallery Opening",
    description: "Discover new contemporary art at this exclusive gallery opening",
    date: "2025-10-21",
    location: "SFMOMA",
    vibe: ["Unique", "Exciting"],
    interests: ["Arts"],
  },
  {
    id: "4",
    title: "Community Basketball Tournament",
    description: "Watch or participate in friendly basketball games",
    date: "2025-10-19",
    location: "Mission Recreation Center",
    vibe: ["Epic", "Recurring"],
    interests: ["Sports"],
  },
  {
    id: "5",
    title: "Guided Meditation Workshop",
    description: "Learn mindfulness techniques in this beginner-friendly workshop",
    date: "2025-10-22",
    location: "Zen Center",
    vibe: ["Peaceful"],
    interests: ["Meditation"],
  },
];

export default function Discover() {
  const navigate = useNavigate();
  const [timeFilter, setTimeFilter] = useState<"today" | "this_week">("this_week");
  const [userCity, setUserCity] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("city")
        .eq("id", user.id)
        .single();

      if (profile) {
        setUserCity(profile.city);
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const filteredEvents = MOCK_EVENTS.filter((event) => {
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
            {filteredEvents.map((event) => (
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

                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {event.vibe.map((v) => (
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
                </div>
              </Card>
            ))}
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
