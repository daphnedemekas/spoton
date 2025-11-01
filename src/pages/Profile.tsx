import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AuthGuard } from "@/components/AuthGuard";
import { ArrowLeft, MapPin, Calendar, Sparkles, Heart, CheckCircle, Settings, Users, UserPlus, UserCheck, UserX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import logoIcon from "@/assets/logo-icon.png";
import type { Event } from "@/types/event";

type Profile = {
  id: string;
  email: string;
  city: string;
  first_name: string | null;
  last_name: string | null;
  profile_picture_url: string | null;
};

type Connection = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  city: string;
  profile_picture_url: string | null;
};

type AttendanceWithEvent = {
  status: string;
  event: Event;
};

export default function Profile() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [willAttendEvents, setWillAttendEvents] = useState<Event[]>([]);
  const [attendedEvents, setAttendedEvents] = useState<Event[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [interests, setInterests] = useState<string[]>([]);
  const [vibes, setVibes] = useState<string[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'none' | 'pending_sent' | 'pending_received' | 'accepted'>('none');
  const [connectionId, setConnectionId] = useState<string>();

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

      // Load attendance and fetch events separately (no joins)
      const { data: attendanceRows } = await supabase
        .from("event_attendance")
        .select("status, event_id")
        .eq("user_id", userId)
        .in("status", ["saved", "attended"]);

      if (attendanceRows && attendanceRows.length > 0) {
        const savedIds = attendanceRows.filter((r: any) => r.status === "saved").map((r: any) => r.event_id);
        const attendedIds = attendanceRows.filter((r: any) => r.status === "attended").map((r: any) => r.event_id);

        let savedEvents: Event[] = [];
        let attendedEventsList: Event[] = [];

        if (savedIds.length > 0) {
          const { data: evSaved } = await supabase
            .from("events")
            .select("*")
            .in("id", savedIds);
          savedEvents = (evSaved as any) || [];
        }

        if (attendedIds.length > 0) {
          const { data: evAttended } = await supabase
            .from("events")
            .select("*")
            .in("id", attendedIds);
          attendedEventsList = (evAttended as any) || [];
        }

        setWillAttendEvents(savedEvents);
        setAttendedEvents(attendedEventsList);
      } else {
        setWillAttendEvents([]);
        setAttendedEvents([]);
      }

      // Load connection status if viewing someone else's profile
      if (userId !== user.id) {
        const { data: conn1 } = await supabase
          .from('user_connections')
          .select('*')
          .eq('user_id', user.id)
          .eq('connected_user_id', userId)
          .maybeSingle();

        const { data: conn2 } = await supabase
          .from('user_connections')
          .select('*')
          .eq('user_id', userId)
          .eq('connected_user_id', user.id)
          .maybeSingle();

        const connectionData = conn1 || conn2;
        if (connectionData) {
          if (connectionData.user_id === user.id) {
            setConnectionStatus(connectionData.status === 'accepted' ? 'accepted' : 'pending_sent');
          } else {
            setConnectionStatus(connectionData.status === 'accepted' ? 'accepted' : 'pending_received');
          }
          setConnectionId(connectionData.id);
        } else {
          setConnectionStatus('none');
          setConnectionId(undefined);
        }
      }

      // Load connections list (no joins): fetch accepted connections and then fetch profiles for other user ids
      const { data: consA } = await supabase
        .from('user_connections')
        .select('id, user_id, connected_user_id, status')
        .eq('status', 'accepted')
        .eq('user_id', userId);
      const { data: consB } = await supabase
        .from('user_connections')
        .select('id, user_id, connected_user_id, status')
        .eq('status', 'accepted')
        .eq('connected_user_id', userId);

      const allCons = [ ...(consA || []), ...(consB || []) ];
      const otherUserIds = Array.from(new Set(allCons.map(c => c.user_id === userId ? c.connected_user_id : c.user_id)));

      if (otherUserIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email, city, profile_picture_url')
          .in('id', otherUserIds);
        setConnections((profilesData as any) || []);
      } else {
        setConnections([]);
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !userId) return;

      const { error } = await supabase
        .from('user_connections')
        .insert({
          user_id: user.id,
          connected_user_id: userId,
          status: 'pending'
        });

      if (error) throw error;

      toast({
        title: "Connection request sent",
        description: "You'll be connected once they accept your request"
      });

      loadProfile();
    } catch (error) {
      console.error("Error connecting:", error);
      toast({
        title: "Error",
        description: "Failed to send connection request",
        variant: "destructive"
      });
    }
  };

  const handleAcceptConnection = async () => {
    try {
      if (!connectionId) return;

      const { error } = await supabase
        .from('user_connections')
        .update({ status: 'accepted' })
        .eq('id', connectionId);

      if (error) throw error;

      toast({
        title: "Connection accepted",
        description: "You are now connected!"
      });

      loadProfile();
    } catch (error) {
      console.error("Error accepting connection:", error);
      toast({
        title: "Error",
        description: "Failed to accept connection",
        variant: "destructive"
      });
    }
  };

  const handleRemoveConnection = async () => {
    try {
      if (!connectionId) return;

      const { error } = await supabase
        .from('user_connections')
        .delete()
        .eq('id', connectionId);

      if (error) throw error;

      toast({
        title: "Connection removed",
        description: "You are no longer connected"
      });

      loadProfile();
    } catch (error) {
      console.error("Error removing connection:", error);
      toast({
        title: "Error",
        description: "Failed to remove connection",
        variant: "destructive"
      });
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
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-glow">
                <img src={logoIcon} alt="SpotOn" className="h-8 w-8" />
              </div>
              <span className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                {isOwnProfile ? "My Profile" : "User Profile"}
              </span>
            </div>
            <div className="flex gap-2">
              {!isOwnProfile && connectionStatus === 'none' && (
                <Button
                  variant="default"
                  onClick={handleConnect}
                  className="gap-2"
                >
                  <UserPlus className="h-4 w-4" />
                  Connect
                </Button>
              )}
              
              {!isOwnProfile && connectionStatus === 'pending_sent' && (
                <Button
                  variant="outline"
                  onClick={handleRemoveConnection}
                  className="gap-2"
                >
                  <UserX className="h-4 w-4" />
                  Cancel Request
                </Button>
              )}
              
              {!isOwnProfile && connectionStatus === 'pending_received' && (
                <>
                  <Button
                    variant="default"
                    onClick={handleAcceptConnection}
                    className="gap-2"
                  >
                    <UserCheck className="h-4 w-4" />
                    Accept
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleRemoveConnection}
                  >
                    <UserX className="h-4 w-4" />
                  </Button>
                </>
              )}
              
              {!isOwnProfile && connectionStatus === 'accepted' && (
                <Button
                  variant="secondary"
                  onClick={handleRemoveConnection}
                  className="gap-2"
                >
                  <UserCheck className="h-4 w-4" />
                  Connected
                </Button>
              )}

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

              {/* Connections */}
              {connections.length > 0 && (
                <div>
                  <h3 className="mb-3 font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Connections ({connections.length})
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {connections.map((connection) => (
                      <div
                        key={connection.id}
                        className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => navigate(`/profile/${connection.id}`)}
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={connection.profile_picture_url || undefined} />
                          <AvatarFallback className="bg-primary text-primary-foreground">
                            {connection.first_name?.[0] || connection.email[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="text-sm">
                          <div className="font-medium">
                            {connection.first_name && connection.last_name
                              ? `${connection.first_name} ${connection.last_name}`
                              : connection.email.split("@")[0]
                            }
                          </div>
                          <div className="text-xs text-muted-foreground">{connection.city}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Events Tabs */}
          <Tabs defaultValue="saved" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="saved" className="gap-2">
                <Heart className="h-4 w-4" />
                Saved ({willAttendEvents.length})
              </TabsTrigger>
              <TabsTrigger value="attended" className="gap-2">
                <CheckCircle className="h-4 w-4" />
                Attended ({attendedEvents.length})
              </TabsTrigger>
              <TabsTrigger value="connections" className="gap-2">
                <Users className="h-4 w-4" />
                Connections ({connections.length})
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

            <TabsContent value="connections" className="mt-6">
              {connections.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {connections.map((connection) => (
                    <Card
                      key={connection.id}
                      className="p-6 shadow-card transition-all hover:scale-[1.02] hover:shadow-glow cursor-pointer"
                      onClick={() => navigate(`/profile/${connection.id}`)}
                    >
                      <h3 className="mb-2 text-xl font-semibold">
                        {connection.first_name && connection.last_name
                          ? `${connection.first_name} ${connection.last_name}`
                          : connection.email.split("@")[0]
                        }
                      </h3>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        <span>{connection.city}</span>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  No connections yet. Search for people to connect with!
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AuthGuard>
  );
}
