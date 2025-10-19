import { forwardRef, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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

interface SwipeableEventCardProps {
  event: Event;
}

export const SwipeableEventCard = forwardRef<HTMLDivElement, SwipeableEventCardProps>(
  ({ event }, ref) => {
    const [otherUsers, setOtherUsers] = useState<Array<{ profile_picture_url: string | null; first_name: string | null }>>([]);

    useEffect(() => {
      const fetchOtherUsers = async () => {
        const { data: currentUser } = await supabase.auth.getUser();
        
        const { data: attendees } = await supabase
          .from('event_attendance')
          .select('user_id, profiles(profile_picture_url, first_name)')
          .eq('event_id', event.id)
          .eq('status', 'saved')
          .neq('user_id', currentUser?.user?.id || '')
          .limit(5);

        if (attendees) {
          const users = attendees
            .filter(a => a.profiles)
            .map(a => ({
              profile_picture_url: (a.profiles as any).profile_picture_url,
              first_name: (a.profiles as any).first_name
            }));
          setOtherUsers(users);
        }
      };

      fetchOtherUsers();
    }, [event.id]);

    const handleEventLink = (e: React.MouseEvent | React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      console.log('Event link clicked:', event.event_link);
      if (event.event_link) {
        window.open(event.event_link, '_blank', 'noopener,noreferrer');
      }
    };

    return (
      <div ref={ref} className="absolute inset-0">
        <Card className="h-full w-full overflow-hidden border-2 border-border/50 bg-card shadow-xl">
          <div className="h-full flex flex-col">
            {event.image_url && (
              <div className="relative h-28 w-full overflow-hidden bg-muted flex-shrink-0">
                <img
                  src={event.image_url}
                  alt={event.title}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            )}
            
            <div className="flex-1 overflow-y-auto p-5 pb-20">
              <div className="mb-3">
                <h2 className="mb-2 text-xl font-bold leading-tight">{event.title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {event.description}
                </p>
              </div>

              <div className="mb-3 space-y-1.5 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm">{new Date(event.date).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span className="text-sm">{event.location}</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {event.vibes.slice(0, 3).map((v) => (
                    <Badge key={v} variant="secondary" className="text-xs py-0.5 px-2">
                      {v}
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {event.interests.slice(0, 3).map((i) => (
                    <Badge key={i} variant="outline" className="text-xs py-0.5 px-2">
                      {i}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Other users who saved this event */}
            {otherUsers.length > 0 && (
              <div className="absolute bottom-16 right-4 flex -space-x-2">
                {otherUsers.map((user, i) => (
                  <Avatar key={i} className="h-8 w-8 border-2 border-card">
                    <AvatarImage src={user.profile_picture_url || undefined} />
                    <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                      {user.first_name?.[0] || '?'}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
            )}
            
            {/* Fixed button bar */}
            {event.event_link && (
              <div className="absolute bottom-0 left-0 right-0 bg-card border-t border-border p-4 z-50">
                <Button
                  variant="outline"
                  size="sm"
                  onPointerDown={handleEventLink}
                  className="w-full gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  Event Link
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  }
);

SwipeableEventCard.displayName = "SwipeableEventCard";
