import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuthGuard } from "@/components/AuthGuard";
import { ArrowLeft, MapPin, Calendar, Sparkles, Heart, CheckCircle, Settings } from "lucide-react";

type Profile = {
  id: string;
  email: string;
  city: string;
  first_name: string | null;
  last_name: string | null;
};

type Event = {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  vibes: string[];
  interests: string[];
};

type AttendanceWithEvent = {
  status: string;
  event: Event;
};

export default function Profile() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [willAttendEvents, setWillAttendEvents] = useState<Event[]>([]);
  const [attendedEvents, setAttendedEvents] = useState<Event[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [interests, setInterests] = useState<string[]>([]);
  const [vibes, setVibes] = useState<string[]>([]);

  useEffect(() => {
    loadProfile();
  }, [userId]);

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      if (!userId) return;

      // Load profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (profileData) {
        setProfile(profileData);
      }

      // Load interests
      const { data: interestsData } = await supabase
        .from("user_interests")
        .select("interest")
        .eq("user_id", userId);

      if (interestsData) {
        setInterests(interestsData.map((i) => i.interest));
      }

      // Load vibes
      const { data: vibesData } = await supabase
        .from("user_vibes")
        .select("vibe")
        .eq("user_id", userId);

      if (vibesData) {
        setVibes(vibesData.map((v) => v.vibe));
      }

      // Load attendance with events
      const { data: attendanceData } = await supabase
        .from("event_attendance")
        .select(`
          status,
          events (
            id,
            title,
            description,
            date,
            location,
            vibes,
            interests
          )
        `)
        .eq("user_id", userId)
        .in("status", ["saved", "attended"]);

      if (attendanceData) {
        const willAttend: Event[] = [];
        const attended: Event[] = [];

        attendanceData.forEach((item: any) => {
          if (item.events) {
            if (item.status === "saved") {
              willAttend.push(item.events);
            } else if (item.status === "attended") {
              attended.push(item.events);
            }
          }
        });

        setWillAttendEvents(willAttend);
        setAttendedEvents(attended);
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const EventCard = ({ event }: { event: Event }) => (
    <Card className="p-4 shadow-card transition-all hover:shadow-glow">
      <h3 className="mb-2 font-semibold text-lg">{event.title}</h3>
      <p className="mb-3 text-sm text-muted-foreground">{event.description}</p>
      
      <div className="mb-3 space-y-2 text-sm">
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
    </Card>
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-subtle">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-subtle">
        <div className="text-center">
          <h2 className="mb-4 text-2xl font-bold">Profile not found</h2>
          <Button onClick={() => navigate("/discover")}>Go Back</Button>
        </div>
      </div>
    );
  }

  const isOwnProfile = currentUserId === userId;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gradient-subtle">
        {/* Header */}
        <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm">
          <div className="container mx-auto flex items-center gap-4 px-4 py-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/discover")}
              className="hover:bg-secondary"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex flex-1 items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                {isOwnProfile ? "My Profile" : "User Profile"}
              </span>
            </div>
            {isOwnProfile && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/settings")}
                className="gap-2"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Button>
            )}
          </div>
        </header>

        <div className="container mx-auto px-4 py-8">
          {/* Profile Info */}
          <div className="mb-8 rounded-2xl bg-card p-8 shadow-card">
            <div className="mb-6">
              <div className="mb-2 flex items-center gap-2">
                <h1 className="text-3xl font-bold">
                  {profile.first_name && profile.last_name
                    ? `${profile.first_name} ${profile.last_name}`
                    : profile.email.split("@")[0]
                  }
                </h1>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{profile.city}</span>
              </div>
            </div>

            {/* Interests & Vibes */}
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 font-semibold">Interests</h3>
                <div className="flex flex-wrap gap-2">
                  {interests.map((interest) => (
                    <Badge key={interest} variant="default">
                      {interest}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-2 font-semibold">Vibes</h3>
                <div className="flex flex-wrap gap-2">
                  {vibes.map((vibe) => (
                    <Badge key={vibe} variant="secondary">
                      {vibe}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Events Tabs */}
          <Tabs defaultValue="saved" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="saved" className="gap-2">
                <Heart className="h-4 w-4" />
                Saved ({willAttendEvents.length})
              </TabsTrigger>
              <TabsTrigger value="attended" className="gap-2">
                <CheckCircle className="h-4 w-4" />
                Attended ({attendedEvents.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="saved" className="mt-6">
              {willAttendEvents.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {willAttendEvents.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  No saved events
                </div>
              )}
            </TabsContent>

            <TabsContent value="attended" className="mt-6">
              {attendedEvents.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {attendedEvents.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  No events marked as "Attended"
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AuthGuard>
  );
}
