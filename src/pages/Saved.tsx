import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AuthGuard } from "@/components/AuthGuard";
import { EventDetailDialog } from "@/components/EventDetailDialog";
import { Settings, Calendar, MapPin, Sparkles, User, ArrowLeft, X, Check, MapPinned } from "lucide-react";
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

export default function Saved() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  useEffect(() => {
    loadSavedEvents();
  }, []);

  const loadSavedEvents = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      // Get saved events
      const { data: savedEventIds } = await supabase
        .from("event_attendance")
        .select("event_id")
        .eq("user_id", user.id)
        .eq("status", "saved");

      if (!savedEventIds || savedEventIds.length === 0) {
        setEvents([]);
        return;
      }

      const eventIds = savedEventIds.map(item => item.event_id);

      const { data: eventsData } = await supabase
        .from("events")
        .select("*")
        .in("id", eventIds)
        .order("date", { ascending: true });

      if (eventsData) {
        setEvents(eventsData);
      }
    } catch (error) {
      console.error("Error loading saved events:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (eventId: string) => {
    try {
      await supabase
        .from("event_attendance")
        .delete()
        .eq("user_id", currentUserId)
        .eq("event_id", eventId);

      setEvents(prev => prev.filter(e => e.id !== eventId));
      toast({ title: "Removed from saved" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const handleMarkAttended = async (eventId: string) => {
    try {
      const { error } = await supabase
        .from("event_attendance")
        .update({ status: "attended" })
        .eq("user_id", currentUserId)
        .eq("event_id", eventId);

      if (error) throw error;

      setEvents(prev => prev.filter(e => e.id !== eventId));
      toast({ title: "Marked as attended!" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const isEventPast = (eventDate: string) => {
    const date = new Date(eventDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

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
            <div className="flex items-center gap-3">
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
                  <MapPinned className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                  SpotOn
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
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
            </div>
          </div>
        </header>

        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold">Saved Events</h1>
            <p className="mt-2 text-muted-foreground">
              Events you've saved to attend
            </p>
          </div>

          {/* Events Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => {
              const isPast = isEventPast(event.date);
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
                    <div className="relative -mx-6 -mt-6 mb-4 aspect-video w-[calc(100%+3rem)] overflow-hidden bg-gradient-to-br from-primary/10 to-secondary/10">
                      {event.image_url ? (
                        <img
                          src={event.image_url}
                          alt={event.title}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Sparkles className="h-12 w-12 text-primary/40" />
                        </div>
                      )}
                    </div>
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
                        {isPast && (
                          <Badge variant="secondary" className="ml-auto text-xs">
                            Past
                          </Badge>
                        )}
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
                      {isPast ? (
                        <>
                          <Button
                            variant="default"
                            size="sm"
                            className="flex-1"
                            onClick={() => handleMarkAttended(event.id)}
                          >
                            <Check className="mr-1 h-4 w-4" />
                            Attended
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => handleRemove(event.id)}
                          >
                            <X className="mr-1 h-4 w-4" />
                            Remove
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => handleRemove(event.id)}
                        >
                          <X className="mr-1 h-4 w-4" />
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {events.length === 0 && (
            <div className="mt-12 text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                <Calendar className="h-10 w-10 text-muted-foreground" />
              </div>
              <h2 className="mb-2 text-2xl font-semibold">No saved events</h2>
              <p className="mb-4 text-muted-foreground">
                Events you save will appear here
              </p>
              <Button onClick={() => navigate("/discover")}>
                Discover Events
              </Button>
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
