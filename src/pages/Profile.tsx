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

      // Load connection status if viewing someone else's profile
      if (userId !== user.id) {
        const { data: connectionData } = await supabase
          .from('user_connections')
          .select('*')
          .or(`and(user_id.eq.${user.id},connected_user_id.eq.${userId}),and(user_id.eq.${userId},connected_user_id.eq.${user.id})`)
          .maybeSingle();

        if (connectionData) {
          if (connectionData.user_id === user.id) {
            setConnectionStatus(connectionData.status === 'accepted' ? 'accepted' : 'pending_sent');
          } else {
            setConnectionStatus(connectionData.status === 'accepted' ? 'accepted' : 'pending_received');
          }
          setConnectionId(connectionData.id);
        }
      }

      // Load connections list
      const { data: connectionsData } = await supabase
        .from('user_connections')
        .select('user_id, connected_user_id, profiles!user_connections_user_id_fkey(id, first_name, last_name, email, city), profiles!user_connections_connected_user_id_fkey(id, first_name, last_name, email, city)')
        .eq('status', 'accepted')
        .or(`user_id.eq.${userId},connected_user_id.eq.${userId}`);

      if (connectionsData) {
        const connectedProfiles = connectionsData.map(conn => {
          const isUserInitiator = conn.user_id === userId;
          const profileData: any = isUserInitiator 
            ? conn['profiles!user_connections_connected_user_id_fkey']
            : conn['profiles!user_connections_user_id_fkey'];
          
          return profileData as Profile;
        }).filter(Boolean);
        
        setConnections(connectedProfiles);
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
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
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
