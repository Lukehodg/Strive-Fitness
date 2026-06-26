/**
 * Placeholder DB types — hand-written to mirror supabase/migrations/0001_init.sql.
 *
 * Replace by regenerating against the live schema once the project is linked:
 *   npm run gen:types
 *   (supabase gen types typescript --linked > types/database.ts)
 *
 * Keep this in sync with the schema until generation is wired up.
 */

export type ActivityType = "football" | "gym" | "networking";
export type ActivityStatus = "open" | "full" | "cancelled" | "completed";
export type ParticipantStatus = "joined" | "left";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          avatar_url: string | null;
          area_label: string | null;
          home_location: string | null;
          phone_verified: boolean;
          bio: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          avatar_url?: string | null;
          area_label?: string | null;
          home_location?: string | null;
          phone_verified?: boolean;
          bio?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      activities: {
        Row: {
          id: string;
          host_id: string;
          activity_type: ActivityType;
          title: string;
          venue_label: string;
          location: string;
          starts_at: string;
          duration_minutes: number;
          max_players: number;
          status: ActivityStatus;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          host_id: string;
          activity_type?: ActivityType;
          title: string;
          venue_label: string;
          location: string;
          starts_at: string;
          duration_minutes?: number;
          max_players: number;
          status?: ActivityStatus;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["activities"]["Insert"]>;
        Relationships: [];
      };
      activity_participants: {
        Row: {
          activity_id: string;
          user_id: string;
          status: ParticipantStatus;
          joined_at: string;
        };
        Insert: {
          activity_id: string;
          user_id: string;
          status?: ParticipantStatus;
        };
        Update: Partial<Database["public"]["Tables"]["activity_participants"]["Insert"]>;
        Relationships: [];
      };
      connections: {
        Row: { user_id: string; connection_id: string; created_at: string };
        Insert: { user_id: string; connection_id: string };
        Update: Partial<{ user_id: string; connection_id: string }>;
        Relationships: [];
      };
      blocks: {
        Row: { blocker_id: string; blocked_id: string; created_at: string };
        Insert: { blocker_id: string; blocked_id: string };
        Update: Partial<{ blocker_id: string; blocked_id: string }>;
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          reporter_id: string;
          reported_user_id: string;
          activity_id: string | null;
          reason: string;
          details: string | null;
          created_at: string;
        };
        Insert: {
          reporter_id: string;
          reported_user_id: string;
          activity_id?: string | null;
          reason: string;
          details?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["reports"]["Insert"]>;
        Relationships: [];
      };
      push_tokens: {
        Row: { user_id: string; token: string; platform: "ios" | "android"; created_at: string };
        Insert: { user_id: string; token: string; platform: "ios" | "android" };
        Update: Partial<{ token: string; platform: "ios" | "android" }>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      nearby_activities: {
        Args: {
          lat: number;
          lng: number;
          radius_meters?: number;
          type_filter?: ActivityType;
        };
        Returns: {
          id: string;
          host_id: string;
          host_name: string;
          title: string;
          venue_label: string;
          venue_lat: number;
          venue_lng: number;
          starts_at: string;
          duration_minutes: number;
          max_players: number;
          status: ActivityStatus;
          distance_meters: number;
          joined_count: number;
        }[];
      };
    };
    Enums: {
      activity_type: ActivityType;
      activity_status: ActivityStatus;
      participant_status: ParticipantStatus;
    };
  };
}

/** Convenience row aliases. */
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Activity = Database["public"]["Tables"]["activities"]["Row"];
export type ActivityParticipant =
  Database["public"]["Tables"]["activity_participants"]["Row"];
export type NearbyActivity =
  Database["public"]["Functions"]["nearby_activities"]["Returns"][number];
