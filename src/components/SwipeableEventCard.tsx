import { forwardRef, useEffect, useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, ExternalLink, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Event } from "@/types/event";
import { resolveDisplayLocation } from "@/lib/locationUtils";
import { Skeleton } from "@/components/ui/skeleton";

interface SwipeableEventCardProps {
  event: Event;
  onSave?: (event: Event) => void;
  onDismiss?: (event: Event) => void;
  onViewDetails?: (event: Event) => void;
  isActive?: boolean;
  instructionsId?: string;
}

export const SwipeableEventCard = forwardRef<HTMLDivElement, SwipeableEventCardProps>(
  ({ event, onSave, onDismiss, onViewDetails, isActive = false, instructionsId }, ref) => {
    const [otherUsers, setOtherUsers] = useState<Array<{ profile_picture_url: string | null; first_name: string | null }>>([]);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const [shouldLoadImage, setShouldLoadImage] = useState(false);

    const displayLocation = resolveDisplayLocation(event.title, event.location);
    const titleId = `event-${event.id}-title`;
    const descriptionId = `event-${event.id}-description`;

    const describedBy = instructionsId ? `${descriptionId} ${instructionsId}` : descriptionId;

    useEffect(() => {
      if (!event.image_url) {
        setShouldLoadImage(false);
        return;
      }
      setShouldLoadImage(false);

      const node = imageRef.current;
      if (!node) {
        setShouldLoadImage(true);
        return;
      }

      if (typeof IntersectionObserver === "undefined") {
        setShouldLoadImage(true);
        return;
      }

      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShouldLoadImage(true);
            observer.disconnect();
          }
        });
      }, { rootMargin: "120px" });

      observer.observe(node);
      return () => observer.disconnect();
    }, [event.id, event.image_url]);

    useEffect(() => {
      if (isActive && event.image_url) {
        setShouldLoadImage(true);
      }
    }, [isActive, event.image_url]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!isActive) return;
      if ((e.key === "ArrowRight" || e.key === "d" || e.key === "D") && onSave) {
        e.preventDefault();
        onSave(event);
      }
      if ((e.key === "ArrowLeft" || e.key === "a" || e.key === "A") && onDismiss) {
        e.preventDefault();
        onDismiss(event);
      }
      if ((e.key === "Enter" || e.key === " ") && onViewDetails) {
        e.preventDefault();
        onViewDetails(event);
      }
    };

    useEffect(() => {
      const fetchConnectedUsers = async () => {
        const { data: currentUser } = await supabase.auth.getUser();
        if (!currentUser?.user) return;
        
        // Get accepted connections
        const { data: connections } = await supabase
          .from('user_connections')
          .select('user_id, connected_user_id')
          .eq('status', 'accepted')
          .or(`user_id.eq.${currentUser.user.id},connected_user_id.eq.${currentUser.user.id}`);

        if (!connections || connections.length === 0) {
          setOtherUsers([]);
          return;
        }

        // Get list of connected user IDs
        const connectedUserIds = connections.map(c => 
          c.user_id === currentUser.user.id ? c.connected_user_id : c.user_id
        );

        // Get connected users who saved this event
        const { data: attendees } = await supabase
          .from('event_attendance')
          .select('user_id, profiles(profile_picture_url, first_name)')
          .eq('event_id', event.id)
          .eq('status', 'saved')
          .in('user_id', connectedUserIds)
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

      fetchConnectedUsers();
    }, [event.id]);

    const handleEventLink = (e: React.MouseEvent | React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      console.log('Event link clicked:', event.event_link);
      if (event.event_link) {
        window.open(event.event_link, '_blank', 'noopener,noreferrer');
      }
    };

    const handleEventLinkClick = (e: React.MouseEvent<HTMLButtonElement>) => handleEventLink(e);
    const handleEventLinkPointer = (e: React.PointerEvent<HTMLButtonElement>) => handleEventLink(e);

    return (
      <div ref={ref} className="absolute inset-0">
        <Card
          role="article"
          aria-roledescription="Event card"
          aria-labelledby={titleId}
          aria-describedby={describedBy}
          tabIndex={isActive ? 0 : -1}
          onKeyDown={handleKeyDown}
          onDoubleClick={() => {
            if (isActive && onViewDetails) {
              onViewDetails(event);
            }
          }}
          className="h-full w-full overflow-hidden border-2 border-border/50 bg-card shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
        >
          <div className="h-full flex flex-col">
            {event.image_url && (
              <div className="relative h-28 w-full overflow-hidden bg-muted flex-shrink-0">
                {!shouldLoadImage && <Skeleton className="absolute inset-0" />}
                <img
                  ref={imageRef}
                  src={shouldLoadImage ? event.image_url ?? undefined : undefined}
                  data-src={event.image_url}
                  alt={event.title}
                  className="h-full w-full object-cover transition-opacity duration-300"
                  style={{ opacity: shouldLoadImage ? 1 : 0 }}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            )}
            
            <div className="flex-1 overflow-y-auto p-5 pb-20">
              <div className="mb-3">
                <h2 id={titleId} className="mb-2 text-xl font-bold leading-tight">
                  {event.title}
                </h2>
                <p id={descriptionId} className="text-sm text-muted-foreground leading-relaxed">
                  {event.description}
                </p>
              </div>

              <div className="mb-3 space-y-1.5 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" aria-hidden="true" />
                  <span className="text-sm">{new Date(event.date).toLocaleDateString()}</span>
                </div>
                {event.time && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" aria-hidden="true" />
                    <span className="text-sm">{event.time}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  <span className="text-sm">{displayLocation}</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5" role="list" aria-label="Event vibes">
                  {event.vibes.slice(0, 3).map((v) => (
                    <Badge
                      key={v}
                      variant="secondary"
                      className="text-xs py-0.5 px-2"
                      role="listitem"
                    >
                      {v}
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5" role="list" aria-label="Event interests">
                  {event.interests.slice(0, 3).map((i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="text-xs py-0.5 px-2"
                      role="listitem"
                    >
                      {i}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Other users who saved this event */}
            {otherUsers.length > 0 && (
              <div
                className="absolute bottom-16 right-4 flex -space-x-2"
                aria-label={`${otherUsers.length} of your connections saved this event`}
              >
                {otherUsers.map((user, i) => (
                  <Avatar
                    key={i}
                    className="h-8 w-8 border-2 border-card"
                    title={user.first_name || undefined}
                    aria-label={user.first_name ? `${user.first_name} saved this event` : "Friend saved this event"}
                  >
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
                  onPointerDown={handleEventLinkPointer}
                  onClick={handleEventLinkClick}
                  className="w-full gap-2"
                  aria-label={`Open event link for ${event.title} in a new tab`}
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
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
