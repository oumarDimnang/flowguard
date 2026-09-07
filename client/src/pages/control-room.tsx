import { useState } from 'react';

import { useAuth } from '@/auth/auth-context';
import { DecisionFeed } from '@/features/decisions/decision-feed';
import { FacilityHeader } from '@/features/facility/facility-header';
import { FacilityPanel } from '@/features/facility/facility-panel';
import { HoldingsReadout } from '@/features/operations/holdings-readout';
import { useDecisionFeed } from '@/hooks/use-decision-feed';
import { useFacility } from '@/hooks/use-facility';
import { useSocketStatus } from '@/hooks/use-live-event';
import { useActiveOperations, useHoldings } from '@/hooks/use-operations';

/**
 * The live view — where the demo happens.
 *
 * Two columns below the facility header. The left is the argument in order:
 * what the network is paying for, then what the assets are doing. The right is
 * the evidence, as a sticky rail that scrolls on its own.
 *
 * Nothing on this page knows what industry it is showing. The header reads its
 * vocabulary from the descriptor, and the panel is chosen from the
 * organization's industry — so a container terminal and a drone operator get
 * the same screen with different work on it.
 */
export function ControlRoom() {
  const { identity } = useAuth();
  const facility = useFacility();
  const { operations } = useActiveOperations();
  const holdings = useHoldings(operations);
  const feed = useDecisionFeed();
  const connected = useSocketStatus();

  const [resetting, setResetting] = useState(false);

  const reset = async () => {
    setResetting(true);
    try {
      await facility.reset();
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <FacilityHeader
        descriptor={facility.descriptor}
        onReset={() => void reset()}
        resetting={resetting}
      />

      <div className="grid grid-cols-1 items-start gap-x-10 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)]">
        <div className="min-w-0">
          <HoldingsReadout holdings={holdings} stale={!connected} loading={facility.loading} />

          <FacilityPanel
            industry={identity?.organization.industry}
            descriptor={facility.descriptor}
            jobs={facility.jobs}
            loading={facility.loading}
            onDispatch={facility.dispatch}
            onAbort={facility.abort}
          />
        </div>

        <DecisionFeed records={feed.records} loading={feed.loading} stale={!connected} />
      </div>
    </>
  );
}
