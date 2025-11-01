import { supabase } from "@/integrations/supabase/client";
import type { EventAttendance, EventInteraction } from "@/types/event";

export const eventAttendanceService = {
  /**
   * Save an event for a user
   * Uses both event_id (for lookups) and canonical_key (for deduplication across re-discoveries)
   */
  async saveEvent(userId: string, eventId: string, canonicalKey?: string): Promise<void> {
    // Delete any existing attendance record for this event (by canonical_key if available)
    if (canonicalKey) {
      await supabase
        .from("event_attendance")
        .delete()
        .eq("user_id", userId)
        .eq("canonical_key", canonicalKey);
    } else {
      await supabase
        .from("event_attendance")
        .delete()
        .eq("user_id", userId)
        .eq("event_id", eventId);
    }

    // Insert new 'saved' record
    const { error } = await supabase.from("event_attendance").insert({
      user_id: userId,
      event_id: eventId,
      canonical_key: canonicalKey || null,
      status: "saved",
    });

    if (error) throw error;
  },

  /**
   * Dismiss/remove an event for a user
   * Uses both event_id (for lookups) and canonical_key (for deduplication across re-discoveries)
   */
  async dismissEvent(userId: string, eventId: string, canonicalKey?: string): Promise<void> {
    // Delete any existing attendance record for this event (by canonical_key if available)
    if (canonicalKey) {
      await supabase
        .from("event_attendance")
        .delete()
        .eq("user_id", userId)
        .eq("canonical_key", canonicalKey);
    } else {
      await supabase
        .from("event_attendance")
        .delete()
        .eq("user_id", userId)
        .eq("event_id", eventId);
    }

    // Insert new 'dismissed' record
    const { error } = await supabase.from("event_attendance").insert({
      user_id: userId,
      event_id: eventId,
      canonical_key: canonicalKey || null,
      status: "dismissed",
    });

    if (error) throw error;
  },

  /**
   * Mark an event as attended
   */
  async markAttended(attendanceId: string): Promise<void> {
    const { error } = await supabase
      .from("event_attendance")
      .update({ status: "attended" })
      .eq("id", attendanceId);

    if (error) throw error;
  },

  /**
   * Remove a saved event (delete the attendance record)
   */
  async removeSavedEvent(attendanceId: string): Promise<void> {
    const { error } = await supabase
      .from("event_attendance")
      .delete()
      .eq("id", attendanceId);

    if (error) throw error;
  },

  /**
   * Log an event interaction
   */
  async logInteraction(
    userId: string,
    eventTitle: string,
    interactionType: "saved" | "dismissed" | "attended"
  ): Promise<void> {
    const { error } = await supabase.from("event_interactions").insert({
      user_id: userId,
      event_title: eventTitle,
      interaction_type: interactionType,
      timestamp: new Date().toISOString(),
    });

    if (error) {
      console.error("Failed to log interaction:", error);
      // Don't throw - logging is non-critical
    }
  },

  /**
   * Get all saved events for a user
   */
  async getSavedEvents(userId: string): Promise<EventAttendance[]> {
    const { data, error } = await supabase
      .from("event_attendance")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "saved")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data as EventAttendance[]) || [];
  },

  /**
   * Get all attended events for a user
   */
  async getAttendedEvents(userId: string): Promise<EventAttendance[]> {
    const { data, error } = await supabase
      .from("event_attendance")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "attended")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data as EventAttendance[]) || [];
  },

  /**
   * Get all dismissed events for a user
   */
  async getDismissedEvents(userId: string): Promise<EventAttendance[]> {
    const { data, error } = await supabase
      .from("event_attendance")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "dismissed")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data as EventAttendance[]) || [];
  },

  /**
   * Check if an event has been interacted with by a user
   */
  async hasInteractedWith(userId: string, eventId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("event_attendance")
      .select("id")
      .eq("user_id", userId)
      .eq("event_id", eventId)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 is "no rows returned" - not an error for this check
      throw error;
    }

    return !!data;
  },
};
