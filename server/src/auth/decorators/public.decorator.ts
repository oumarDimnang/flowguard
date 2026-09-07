import { SetMetadata } from '@nestjs/common';

export const PUBLIC_KEY = 'flowguard:public';

/**
 * Opts a route out of SessionAuthGuard.
 *
 * Reserved for the three surfaces that genuinely cannot carry a session: the
 * login route, the liveness probe, and the machine-to-machine endpoints that
 * authenticate with their own tokens instead (the agent's decision sink and
 * Nokia's webhooks).
 */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
