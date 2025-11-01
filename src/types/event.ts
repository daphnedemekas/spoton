export type Event = {
  id: string;
  title: string;
  description: string;
  date: string;
  time?: string;
  location: string;
  vibes: string[];
  interests: string[];
  image_url?: string;
  event_link?: string;
  canonical_key?: string;
};

export type EventAttendance = {
  id: string;
  user_id: string;
  event_id: string;
  status: 'saved' | 'attended' | 'dismissed';
  created_at: string;
};

export type EventInteraction = {
  user_id: string;
  event_title: string;
  interaction_type: 'saved' | 'dismissed' | 'attended';
  timestamp: string;
};
