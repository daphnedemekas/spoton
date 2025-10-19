import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, ExternalLink } from "lucide-react";

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

interface EventDetailDialogProps {
  event: Event | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EventDetailDialog({ event, open, onOpenChange }: EventDetailDialogProps) {
  if (!event) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">{event.title}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {event.image_url && (
            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
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

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-5 w-5" />
              <span>{new Date(event.date).toLocaleDateString('en-US', { 
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}</span>
            </div>
            
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-5 w-5" />
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
              <div className="flex flex-wrap gap-2">
                {event.vibes.map((vibe) => (
                  <Badge key={vibe} variant="secondary">
                    {vibe}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-2 font-semibold">Interests</h3>
              <div className="flex flex-wrap gap-2">
                {event.interests.map((interest) => (
                  <Badge key={interest} variant="outline">
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
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View Event Details
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}