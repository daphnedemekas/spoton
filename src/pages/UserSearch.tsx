import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AuthGuard } from "@/components/AuthGuard";
import { ArrowLeft, Search, Sparkles, MapPin } from "lucide-react";

type UserProfile = {
  id: string;
  email: string;
  city: string;
};

export default function UserSearch() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, email, city")
        .or(`email.ilike.%${searchQuery}%,city.ilike.%${searchQuery}%`)
        .limit(20);

      if (data) {
        setSearchResults(data);
      }
    } catch (error) {
      console.error("Error searching users:", error);
    } finally {
      setLoading(false);
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
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
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
                placeholder="Search by email or city..."
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
                className="cursor-pointer p-6 shadow-card transition-all hover:scale-[1.02] hover:shadow-glow"
                onClick={() => navigate(`/profile/${profile.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="mb-2 text-xl font-semibold">
                      {profile.email.split("@")[0]}
                    </h3>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span>{profile.city}</span>
                    </div>
                  </div>
                  <Button variant="outline">View Profile</Button>
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
