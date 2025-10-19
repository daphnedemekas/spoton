import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, ExternalLink, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isPast, parseISO } from "date-fns";

interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  event_link: string | null;
  interests: string[];
  vibes: string[];
  attendance?: {
    id: string;
    status: string;
  };
}

const Saved = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchSavedEvents = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: attendanceData, error: attendanceError } = await supabase
        .from('event_attendance')
        .select('event_id, id, status')
        .eq('user_id', user.id)
        .eq('status', 'saved');

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
        .in('id', eventIds);

      if (eventsError) throw eventsError;

      const eventsWithAttendance = eventsData?.map(event => ({
        ...event,
        attendance: attendanceData?.find(a => a.event_id === event.id)
      })) || [];

      setEvents(eventsWithAttendance);
    } catch (error) {
      console.error('Error fetching saved events:', error);
      toast({
        title: "Error",
        description: "Failed to load saved events",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSavedEvents();
  }, []);

  const handleAttendanceUpdate = async (eventId: string, attendanceId: string, newStatus: 'attended' | 'not_attended') => {
    try {
      if (newStatus === 'not_attended') {
        // Remove from saved
        const { error } = await supabase
          .from('event_attendance')
          .delete()
          .eq('id', attendanceId);

        if (error) throw error;
      } else {
        // Update to attended
        const { error } = await supabase
          .from('event_attendance')
          .update({ status: newStatus })
          .eq('id', attendanceId);

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: newStatus === 'attended' ? "Event marked as attended" : "Event removed from saved",
      });

      fetchSavedEvents();
    } catch (error) {
      console.error('Error updating attendance:', error);
      toast({
        title: "Error",
        description: "Failed to update attendance",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-4xl font-bold mb-8">Saved Events</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-4xl font-bold mb-8">Saved Events</h1>
        <p className="text-muted-foreground">No saved events yet. Discover events to save them!</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-4xl font-bold mb-8">Saved Events</h1>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {events.map((event) => {
          const eventDate = parseISO(event.date);
          const isEventPast = isPast(eventDate);

          return (
            <Card key={event.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle>{event.title}</CardTitle>
                <CardDescription>
                  <div className="flex items-center gap-2 mt-2">
                    <Calendar className="h-4 w-4" />
                    {event.date}
                  </div>
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

                {isEventPast && event.attendance ? (
                  <div className="flex gap-2 mt-4">
                    <Button
                      size="sm"
                      onClick={() => handleAttendanceUpdate(event.id, event.attendance!.id, 'attended')}
                      className="flex-1"
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Attended
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAttendanceUpdate(event.id, event.attendance!.id, 'not_attended')}
                      className="flex-1"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Did Not Attend
                    </Button>
                  </div>
                ) : (
                  event.event_link && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(event.event_link!, '_blank')}
                      className="w-full mt-4"
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      View Event
                    </Button>
                  )
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default Saved;
