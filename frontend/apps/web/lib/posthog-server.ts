import { PostHog } from 'posthog-node';

export function getPostHogClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!key) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error(
        'NEXT_PUBLIC_POSTHOG_KEY variable required by PostHog is missing or un-configured, ' +
          'this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_KEY is configured',
      );
    }
    return null;
  }

  return new PostHog(key, {
    host: host ?? 'https://us.i.posthog.com',
    flushAt: 1,
    flushInterval: 0,
  });
}
