import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, Calendar, MapPin, Heart } from "lucide-react";

export default function Index() {
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", session.user.id)
        .single();

      if (profile) {
        navigate("/discover");
      } else {
        navigate("/onboarding");
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center justify-center rounded-3xl bg-gradient-primary p-4 shadow-glow">
            <Sparkles className="h-16 w-16 text-primary-foreground" />
          </div>
          
          <h1 className="mb-6 text-5xl font-bold leading-tight md:text-7xl">
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              SpotOn
            </span>
          </h1>
          
          <p className="mb-8 text-xl text-muted-foreground md:text-2xl">
            Discover events that match your interests and energy
          </p>

          <Button
            onClick={() => navigate("/auth")}
            size="lg"
            className="h-14 px-8 text-lg bg-gradient-primary text-primary-foreground shadow-glow transition-all hover:scale-105"
          >
            Get Started
          </Button>
        </div>

        {/* Features */}
        <div className="mx-auto mt-24 grid max-w-5xl gap-8 md:grid-cols-3">
          <div className="rounded-2xl bg-card p-8 text-center shadow-card transition-all hover:scale-105">
            <div className="mb-4 inline-flex items-center justify-center rounded-2xl bg-gradient-accent p-4">
              <Calendar className="h-8 w-8 text-accent-foreground" />
            </div>
            <h3 className="mb-2 text-xl font-semibold">Personalized Events</h3>
            <p className="text-muted-foreground">
              Get recommendations based on your unique interests and vibes
            </p>
          </div>

          <div className="rounded-2xl bg-card p-8 text-center shadow-card transition-all hover:scale-105">
            <div className="mb-4 inline-flex items-center justify-center rounded-2xl bg-gradient-primary p-4">
              <MapPin className="h-8 w-8 text-primary-foreground" />
            </div>
            <h3 className="mb-2 text-xl font-semibold">Local Discoveries</h3>
            <p className="text-muted-foreground">
              Find amazing happenings right in your neighborhood
            </p>
          </div>

          <div className="rounded-2xl bg-card p-8 text-center shadow-card transition-all hover:scale-105">
            <div className="mb-4 inline-flex items-center justify-center rounded-2xl bg-gradient-accent p-4">
              <Heart className="h-8 w-8 text-accent-foreground" />
            </div>
            <h3 className="mb-2 text-xl font-semibold">Email Updates</h3>
            <p className="text-muted-foreground">
              Stay in the loop with customizable email notifications
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
