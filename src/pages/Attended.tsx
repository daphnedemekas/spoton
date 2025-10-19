import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, ExternalLink, ArrowLeft, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  time?: string;
  location: string;
  event_link: string | null;
  interests: string[];
  vibes: string[];
}

const Attended = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAttendedEvents = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: attendanceData, error: attendanceError } = await supabase
        .from('event_attendance')
        .select('event_id')
        .eq('user_id', user.id)
        .eq('status', 'attended');

      if (attendanceError) throw attendanceError;

      const eventIds = attendanceData?.map(a => a.event_id) || [];
      
      if (eventIds.length === 0) {
        setEvents([]);
        setLoading(false);
        return;
      }

      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .in('id', eventIds)
        .order('date', { ascending: false });

      if (eventsError) throw eventsError;

      setEvents(eventsData || []);
    } catch (error) {
      console.error('Error fetching attended events:', error);
      toast({
        title: "Error",
        description: "Failed to load attended events",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendedEvents();
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-4xl font-bold mb-8">Attended Events</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-4xl font-bold mb-8">Attended Events</h1>
        <p className="text-muted-foreground">No attended events yet. Mark events as attended to see them here!</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center gap-4 mb-8">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/discover")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-4xl font-bold">Attended Events</h1>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {events.map((event) => (
          <Card key={event.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>{event.title}</CardTitle>
              <CardDescription>
                <div className="flex items-center gap-2 mt-2">
                  <Calendar className="h-4 w-4" />
                  {event.date}
                </div>
                {event.time && (
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="h-4 w-4" />
                    {event.time}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <MapPin className="h-4 w-4" />
                  {event.location}
                </div>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">{event.description}</p>
              
              <div className="flex flex-wrap gap-2 mb-4">
                {event.interests.map((interest) => (
                  <Badge key={interest} variant="secondary">
                    {interest}
                  </Badge>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {event.vibes.map((vibe) => (
                  <Badge key={vibe} variant="outline">
                    {vibe}
                  </Badge>
                ))}
              </div>

              {event.event_link && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(event.event_link!, '_blank')}
                  className="w-full"
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  View Event
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Attended;
