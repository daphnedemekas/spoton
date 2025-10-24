import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Calendar, MapPin, ExternalLink, Check, X, ArrowLeft, Trash2, List, CalendarDays, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isPast, parseISO, format, isSameDay } from "date-fns";
import logoIcon from "@/assets/logo-icon.png";
import { cn } from "@/lib/utils";

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
  attendance?: {
    id: string;
    status: string;
  };
}

const Saved = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchSavedEvents = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get saved records
      const { data: savedData, error: attendanceError } = await supabase
        .from('event_attendance')
        .select('event_id, id, status')
        .eq('user_id', user.id)
        .eq('status', 'saved');

      if (attendanceError) throw attendanceError;
      // Get dismissed records and exclude them from saved
      const { data: dismissedData } = await supabase
        .from('event_attendance')
        .select('event_id')
        .eq('user_id', user.id)
        .eq('status', 'dismissed');

      const dismissedIds = new Set((dismissedData || []).map(d => d.event_id));
      const filteredSaved = (savedData || []).filter(a => !dismissedIds.has(a.event_id));

      const eventIds = filteredSaved.map(a => a.event_id) || [];
      
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
        attendance: filteredSaved.find(a => a.event_id === event.id)
      })) || [];

      // Also exclude saved events whose canonical key matches a dismissed event's canonical key
      if (dismissedIds.size > 0) {
        const dismissedIdsArray = Array.from(dismissedIds);
        const { data: dismissedEvents } = await supabase
          .from('events')
          .select('*')
          .in('id', dismissedIdsArray);
        const dismissedCanonical = new Set(
          (dismissedEvents || []).map((e: any) => `${(e.title||'').toLowerCase()}|${(e.date||'').slice(0,10)}|${(e.location||'').toLowerCase()}`)
        );
        const filteredByCanonical = eventsWithAttendance.filter((e: any) => {
          const key = `${(e.title||'').toLowerCase()}|${(e.date||'').slice(0,10)}|${(e.location||'').toLowerCase()}`;
          return !dismissedCanonical.has(key);
        });
        // replace
        eventsWithAttendance.length = 0;
        eventsWithAttendance.push(...filteredByCanonical);
      }

      // Sort by date - soonest first
      const sortedEvents = eventsWithAttendance.sort((a, b) => {
        const dateA = parseISO(a.date);
        const dateB = parseISO(b.date);
        return dateA.getTime() - dateB.getTime();
      });

      setEvents(sortedEvents);
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

    // Refresh when page becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchSavedEvents();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const handleAttendanceUpdate = async (eventId: string, attendanceId: string, newStatus: 'attended' | 'not_attended') => {
    try {
      if (newStatus === 'not_attended') {
        // Remove from saved
        const { error } = await (supabase as any)
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

  const handleRemoveEvent = async (eventId: string, attendanceId: string) => {
    try {
      const { error } = await supabase
        .from('event_attendance')
        .delete()
        .eq('id', attendanceId);

      if (error) throw error;

      // Also mark as dismissed to prevent reappearing by canonical dedupe
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await (supabase as any).from('event_attendance').delete().eq('user_id', user.id).eq('event_id', eventId);
        await supabase.from('event_attendance').insert({ user_id: user.id, event_id: eventId, status: 'dismissed' });
      }

      toast({
        title: "Success",
        description: "Event removed from saved",
      });

      fetchSavedEvents();
    } catch (error) {
      console.error('Error removing event:', error);
      toast({
        title: "Error",
        description: "Failed to remove event",
        variant: "destructive",
      });
    }
  };

  // Get all event dates for calendar highlighting
  const eventDates = events.map(event => parseISO(event.date));
  
  // Get events for selected date
  const selectedDateEvents = selectedDate
    ? events.filter(event => isSameDay(parseISO(event.date), selectedDate))
    : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm">
          <div className="container mx-auto flex items-center justify-between px-4 py-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/discover")}
              className="hover:bg-secondary"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Discover
            </Button>
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-glow">
                <img src={logoIcon} alt="SpotOn" className="h-8 w-8" />
              </div>
              <span className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                SpotOn
              </span>
            </div>
          </div>
        </header>
        <div className="container mx-auto p-6">
          <h1 className="text-4xl font-bold mb-8">Saved Events</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm">
          <div className="container mx-auto flex items-center justify-between px-4 py-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/discover")}
              className="hover:bg-secondary"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Discover
            </Button>
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-glow">
                <img src={logoIcon} alt="SpotOn" className="h-8 w-8" />
              </div>
              <span className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                SpotOn
              </span>
            </div>
          </div>
        </header>
        <div className="container mx-auto p-6">
          <h1 className="text-4xl font-bold mb-8">Saved Events</h1>
          <p className="text-muted-foreground">No saved events yet. Discover events to save them!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/discover")}
            className="hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Discover
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-glow">
              <img src={logoIcon} alt="SpotOn" className="h-8 w-8" />
            </div>
            <span className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              SpotOn
            </span>
          </div>
        </div>
      </header>
      <div className="container mx-auto p-6">
        <h1 className="text-4xl font-bold mb-8">Saved Events</h1>
        
        <Tabs defaultValue="list" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
            <TabsTrigger value="list" className="gap-2">
              <List className="h-4 w-4" />
              List View
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-2">
              <CalendarDays className="h-4 w-4" />
              Calendar View
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list">
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
                          {format(eventDate, "PPP")}
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

                      {isEventPast && event.attendance ? (
                        <div className="flex flex-col gap-2 mt-4">
                          <div className="flex gap-2">
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
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 mt-4">
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
                          {event.attendance && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleRemoveEvent(event.id, event.attendance!.id)}
                              className="w-full"
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Remove
                            </Button>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="calendar">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Calendar */}
              <div className="flex justify-center">
                <CalendarComponent
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  className={cn("rounded-md border shadow-card pointer-events-auto")}
                  modifiers={{
                    hasEvent: eventDates
                  }}
                  modifiersClassNames={{
                    hasEvent: "bg-primary/20 font-bold"
                  }}
                />
              </div>

              {/* Events for selected date */}
              <div>
                {selectedDate ? (
                  <>
                    <h2 className="text-2xl font-bold mb-4">
                      Events on {format(selectedDate, "PPP")}
                    </h2>
                    {selectedDateEvents.length > 0 ? (
                      <div className="space-y-4">
                        {selectedDateEvents.map((event) => {
                          const eventDate = parseISO(event.date);
                          const isEventPast = isPast(eventDate);

                          return (
                            <Card key={event.id} className="hover:shadow-lg transition-shadow">
                              <CardHeader>
                                <CardTitle>{event.title}</CardTitle>
                                <CardDescription>
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

                                {isEventPast && event.attendance ? (
                                  <div className="flex flex-col gap-2 mt-4">
                                    <div className="flex gap-2">
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
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-2 mt-4">
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
                                    {event.attendance && (
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => handleRemoveEvent(event.attendance!.id)}
                                        className="w-full"
                                      >
                                        <Trash2 className="h-4 w-4 mr-1" />
                                        Remove
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No events scheduled for this date</p>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground text-center">
                      Select a date on the calendar to view events
                    </p>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Saved;
