export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

interface RankedProfileRow {
  profile_id: string;
  game_version: string;
  display_name: string;
  rating: number;
  wins: number;
  draws: number;
  losses: number;
  matches: number;
  updated_at: string;
}

interface RankedMatchRow {
  room_id: string;
  game_version: string;
  home_profile_id: string;
  away_profile_id: string;
  home_score: number;
  away_score: number;
  home_rating_change: number;
  away_rating_change: number;
  created_at: string;
}

export interface RankedDatabase {
  public: {
    Tables: {
      ranked_profiles: {
        Row: RankedProfileRow;
        Insert: Omit<RankedProfileRow, "rating" | "wins" | "draws" | "losses" | "matches" | "updated_at"> & Partial<Pick<RankedProfileRow, "rating" | "wins" | "draws" | "losses" | "matches" | "updated_at">>;
        Update: Partial<RankedProfileRow>;
        Relationships: [];
      };
      ranked_matches: {
        Row: RankedMatchRow;
        Insert: Omit<RankedMatchRow, "created_at"> & Partial<Pick<RankedMatchRow, "created_at">>;
        Update: Partial<RankedMatchRow>;
        Relationships: [];
      };
      game_rooms: {
        Row: {
          room_id: string;
          game_version: string;
          created_at: string;
          updated_at: string;
          status: string;
          room_data: Json;
          revision: number;
        };
        Insert: {
          room_id: string;
          game_version: string;
          created_at: string;
          updated_at: string;
          status: string;
          room_data: Json;
          revision?: number;
        };
        Update: Partial<{
          room_id: string;
          game_version: string;
          created_at: string;
          updated_at: string;
          status: string;
          room_data: Json;
          revision: number;
        }>;
        Relationships: [];
      };
      app_rate_limits: {
        Row: {
          bucket_key: string;
          window_started_at: string;
          request_count: number;
          updated_at: string;
        };
        Insert: {
          bucket_key: string;
          window_started_at: string;
          request_count?: number;
          updated_at?: string;
        };
        Update: Partial<{
          bucket_key: string;
          window_started_at: string;
          request_count: number;
          updated_at: string;
        }>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      submit_ranked_result: {
        Args: {
          p_room_id: string;
          p_game_version: string;
          p_home_profile_id: string;
          p_home_name: string;
          p_away_profile_id: string;
          p_away_name: string;
          p_home_score: number;
          p_away_score: number;
          p_home_outcome: number;
        };
        Returns: Json;
      };
      check_app_rate_limit: {
        Args: {
          p_bucket_key: string;
          p_limit: number;
          p_window_seconds: number;
        };
        Returns: { allowed: boolean; retry_after: number }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
