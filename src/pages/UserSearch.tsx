import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AuthGuard } from "@/components/AuthGuard";
import { ArrowLeft, Search, Sparkles, MapPin, UserPlus, UserCheck, UserX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import logoIcon from "@/assets/logo-icon.png";

type UserProfile = {
  id: string;
  email: string;
  city: string;
  first_name: string | null;
  last_name: string | null;
  connectionStatus?: 'none' | 'pending_sent' | 'pending_received' | 'accepted';
  connectionId?: string;
};

export default function UserSearch() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  useEffect(() => {
    loadCurrentUser();
  }, []);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, city, first_name, last_name")
        .or(`first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,city.ilike.%${searchQuery}%`)
        .neq('id', user.id)
        .limit(20);

      if (profiles) {
        // Check connection status for each profile
        const { data: connections } = await supabase
          .from('user_connections')
          .select('*')
          .or(`user_id.eq.${user.id},connected_user_id.eq.${user.id}`);

        const profilesWithStatus = profiles.map(profile => {
          const sentConnection = connections?.find(
            c => c.user_id === user.id && c.connected_user_id === profile.id
          );
          const receivedConnection = connections?.find(
            c => c.user_id === profile.id && c.connected_user_id === user.id
          );

          let connectionStatus: UserProfile['connectionStatus'] = 'none';
          let connectionId: string | undefined;

          if (sentConnection) {
            connectionStatus = sentConnection.status === 'accepted' ? 'accepted' : 'pending_sent';
            connectionId = sentConnection.id;
          } else if (receivedConnection) {
            connectionStatus = receivedConnection.status === 'accepted' ? 'accepted' : 'pending_received';
            connectionId = receivedConnection.id;
          }

          return {
            ...profile,
            connectionStatus,
            connectionId
          };
        });

        setSearchResults(profilesWithStatus);
      }
    } catch (error) {
      console.error("Error searching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (userId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

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

      handleSearch(); // Refresh results
    } catch (error) {
      console.error("Error connecting:", error);
      toast({
        title: "Error",
        description: "Failed to send connection request",
        variant: "destructive"
      });
    }
  };

  const handleAcceptConnection = async (connectionId: string) => {
    try {
      const { error } = await supabase
        .from('user_connections')
        .update({ status: 'accepted' })
        .eq('id', connectionId);

      if (error) throw error;

      toast({
        title: "Connection accepted",
        description: "You are now connected!"
      });

      handleSearch(); // Refresh results
    } catch (error) {
      console.error("Error accepting connection:", error);
      toast({
        title: "Error",
        description: "Failed to accept connection",
        variant: "destructive"
      });
    }
  };

  const handleRemoveConnection = async (connectionId: string) => {
    try {
      const { error } = await supabase
        .from('user_connections')
        .delete()
        .eq('id', connectionId);

      if (error) throw error;

      toast({
        title: "Connection removed",
        description: "You are no longer connected"
      });

      handleSearch(); // Refresh results
    } catch (error) {
      console.error("Error removing connection:", error);
      toast({
        title: "Error",
        description: "Failed to remove connection",
        variant: "destructive"
      });
    }
  };

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
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-glow">
                <img src={logoIcon} alt="SpotOn" className="h-8 w-8" />
              </div>
              <span className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                Find People
              </span>
            </div>
          </div>
        </header>

        <div className="container mx-auto max-w-4xl px-4 py-8">
          {/* Search Bar */}
          <div className="mb-8">
            <h1 className="mb-6 text-4xl font-bold">Search for People</h1>
            <div className="flex gap-2">
              <Input
                placeholder="Search by name, email or city..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                className="h-12"
              />
              <Button
                onClick={handleSearch}
                disabled={loading}
                className="h-12 gap-2 bg-gradient-primary text-primary-foreground shadow-glow"
              >
                <Search className="h-4 w-4" />
                Search
              </Button>
            </div>
          </div>

          {/* Search Results */}
          <div className="space-y-4">
            {searchResults.map((profile) => (
              <Card
                key={profile.id}
                className="p-6 shadow-card transition-all hover:shadow-glow"
              >
                <div className="flex items-center justify-between">
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => navigate(`/profile/${profile.id}`)}
                  >
                    <h3 className="mb-2 text-xl font-semibold">
                      {profile.first_name && profile.last_name 
                        ? `${profile.first_name} ${profile.last_name}`
                        : profile.email.split("@")[0]
                      }
                    </h3>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span>{profile.city}</span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    {profile.connectionStatus === 'none' && (
                      <Button
                        variant="default"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleConnect(profile.id);
                        }}
                        className="gap-2"
                      >
                        <UserPlus className="h-4 w-4" />
                        Connect
                      </Button>
                    )}
                    
                    {profile.connectionStatus === 'pending_sent' && (
                      <Button
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (profile.connectionId) handleRemoveConnection(profile.connectionId);
                        }}
                        className="gap-2"
                      >
                        <UserX className="h-4 w-4" />
                        Cancel Request
                      </Button>
                    )}
                    
                    {profile.connectionStatus === 'pending_received' && (
                      <>
                        <Button
                          variant="default"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (profile.connectionId) handleAcceptConnection(profile.connectionId);
                          }}
                          className="gap-2"
                        >
                          <UserCheck className="h-4 w-4" />
                          Accept
                        </Button>
                        <Button
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (profile.connectionId) handleRemoveConnection(profile.connectionId);
                          }}
                        >
                          <UserX className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    
                    {profile.connectionStatus === 'accepted' && (
                      <Button
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (profile.connectionId) handleRemoveConnection(profile.connectionId);
                        }}
                        className="gap-2"
                      >
                        <UserCheck className="h-4 w-4" />
                        Connected
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}

            {!loading && searchResults.length === 0 && searchQuery && (
              <div className="py-12 text-center text-muted-foreground">
                No users found. Try a different search term.
              </div>
            )}

            {!searchQuery && (
              <div className="py-12 text-center text-muted-foreground">
                Enter a search term to find people
              </div>
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
