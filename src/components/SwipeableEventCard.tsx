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
    return (
      <div ref={ref} className="absolute inset-0 cursor-grab active:cursor-grabbing">
        <Card className="h-full w-full overflow-hidden border-2 border-border/50 bg-card shadow-lg">
          <div className="h-full flex flex-col">
            {event.image_url && (
              <div className="relative h-64 w-full overflow-hidden bg-muted flex-shrink-0">
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
            
            <div className="flex-1 overflow-y-auto p-6">
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

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDetails();
                  }}
                  className="flex-1 gap-2"
                >
                  <Info className="h-4 w-4" />
                  More Info
                </Button>
                {event.event_link && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(event.event_link, '_blank');
                    }}
                    className="flex-1 gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Event Link
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }
);

SwipeableEventCard.displayName = "SwipeableEventCard";
