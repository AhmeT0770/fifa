# Ranked and Vercel setup

Ranked ratings, match rooms, and image-analysis rate limits are stored in Supabase Postgres. Saved teams and anonymous profile IDs remain in the player's browser `localStorage`. An anonymous profile ID does not prove account ownership; use Supabase Auth for recoverable accounts.

## Supabase setup

1. Create a project in the [Supabase dashboard](https://supabase.com/dashboard).
2. Open **SQL Editor** and run these migration files in order:
   - `supabase/migrations/202610120001_ranked_leaderboard.sql`
   - `supabase/migrations/202610120002_vercel_rooms_and_rate_limits.sql`
3. Under **Project Settings ? API Keys**, copy the Project URL and the `service_role` key.
4. For local development, add these values to the root `.env.local` file:

```env
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GEMINI_API_KEY=your-Gemini-key
```

`GEMINI_API_KEY` is needed only for roster image analysis. Image files must be 3.75 MB or smaller to leave room for multipart data under Vercel's 4.5 MB function request limit. `SUPABASE_SERVICE_ROLE_KEY` is a server secret: do not prefix it with `NEXT_PUBLIC_`, place it in client code, or commit it to Git.

## Vercel setup

In the Vercel project, open **Settings ? Environment Variables** and add:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY` (only if roster image analysis will be used)

Select **Production** for the live site and **Preview** for test deployments. Create a new deployment after saving environment variables. Do not reuse a service-role key that may have been shared or exposed; generate a fresh one in Supabase.

Rooms are stored in `game_rooms`; optimistic revision checks prevent simultaneous room updates from overwriting each other. The shared image-analysis rate limit uses `app_rate_limits` and the `check_app_rate_limit` function. The second migration creates these objects and limits access to the server key.

## Ranked matches

Create a ranked room from the Ranked League page, confirm your roster, then share the room code. Once both players confirm their rosters, the result is written to Supabase once. Replaying the same result does not award points again. Each FIFA version has a separate Elo rating, starting at 1000. Bot matches do not count toward ranked ratings.

## Accounts and teams

Ranked profiles and saved teams are tied to the browser. Clearing browser data can make an anonymous profile inaccessible. Room access tokens are stored on the server, removed from API responses, and kept in the browser session for the relevant participant.
