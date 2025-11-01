import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, ExternalLink } from "lucide-react";
import type { Event } from "@/types/event";

interface EventDetailDialogProps {
  event: Event | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EventDetailDialog({ event, open, onOpenChange }: EventDetailDialogProps) {
  if (!event) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-labelledby={`event-dialog-${event.id}`}> 
        <DialogHeader>
          <DialogTitle id={`event-dialog-${event.id}`} className="text-2xl">
            {event.title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Detailed information for {event.title} including date, location, description, vibes, and interests.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {event.image_url && (
            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
              <img
                src={event.image_url}
                alt={`${event.title} promotional image`}
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-5 w-5" aria-hidden="true" />
              <span>{new Date(event.date).toLocaleDateString('en-US', { 
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}</span>
            </div>
            
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-5 w-5" aria-hidden="true" />
              <span>{event.location}</span>
            </div>
          </div>

          <div>
            <h3 className="mb-2 font-semibold">Description</h3>
            <p className="text-muted-foreground">{event.description}</p>
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="mb-2 font-semibold">Vibes</h3>
              <div className="flex flex-wrap gap-2" role="list" aria-label="Event vibes">
                {event.vibes.map((vibe) => (
                  <Badge key={vibe} variant="secondary" role="listitem">
                    {vibe}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-2 font-semibold">Interests</h3>
              <div className="flex flex-wrap gap-2" role="list" aria-label="Event interests">
                {event.interests.map((interest) => (
                  <Badge key={interest} variant="outline" role="listitem">
                    {interest}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {event.event_link && (
            <Button
              className="w-full"
              onClick={() => window.open(event.event_link, '_blank')}
              aria-label={`Open event link for ${event.title} in a new tab`}
            >
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
              View Event Details
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}