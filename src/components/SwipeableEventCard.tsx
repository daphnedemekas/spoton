import { forwardRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  onOpenDetails: () => void;
}

export const SwipeableEventCard = forwardRef<HTMLDivElement, SwipeableEventCardProps>(
  ({ event, onOpenDetails }, ref) => {
    const handleMoreInfo = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      console.log('More info clicked for:', event.title);
      onOpenDetails();
    };

    const handleEventLink = (e: React.MouseEvent) => {
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
              <div className="relative h-48 w-full overflow-hidden bg-muted flex-shrink-0">
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
            
            <div className="flex-1 overflow-y-auto p-6 pb-24">
              <div className="mb-4">
                <h2 className="mb-2 text-2xl font-bold">{event.title}</h2>
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {event.description}
                </p>
              </div>

              <div className="mb-4 space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>{new Date(event.date).toLocaleDateString()}</span>
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
            </div>
            
            {/* Fixed button bar */}
            <div className="absolute bottom-0 left-0 right-0 bg-card border-t border-border p-4 flex gap-2 z-50">
              <Button
                variant="outline"
                size="sm"
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={handleMoreInfo}
                className="flex-1 gap-2"
              >
                <Info className="h-4 w-4" />
                Info
              </Button>
              {event.event_link && (
                <Button
                  variant="outline"
                  size="sm"
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={handleEventLink}
                  className="flex-1 gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  Link
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    );
  }
);

SwipeableEventCard.displayName = "SwipeableEventCard";
