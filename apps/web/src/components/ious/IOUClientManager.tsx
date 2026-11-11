'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SerializedIOURecord, SerializedAccount } from '../../lib/money/serialization';
import { ActiveIOUsListCard } from './ActiveIOUsListCard';
import { SettledIOUsCard } from './SettledIOUsCard';
import { SettlementModal } from './SettlementModal';

interface IOUClientManagerProps {
  ious: SerializedIOURecord[];
  accounts: SerializedAccount[];
}

export const IOUClientManager: React.FC<IOUClientManagerProps> = ({
  ious,
  accounts,
}) => {
  const router = useRouter();
  const [selectedIOU, setSelectedIOU] = useState<SerializedIOURecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpenSettleModal = (iou: SerializedIOURecord) => {
    setSelectedIOU(iou);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedIOU(null);
  };

  const handleSettledSuccess = () => {
    router.refresh();
  };

  return (
    <>
      {/* Group 2: Active Peer Debts List Card */}
      <ActiveIOUsListCard
        ious={ious}
        onOpenSettleModal={handleOpenSettleModal}
        currency="₹"
      />

      {/* Group 3: Settled Peer Debts Archive Card */}
      <SettledIOUsCard ious={ious} currency="₹" />

      {/* Contra Clearing Settlement Modal */}
      <SettlementModal
        iou={selectedIOU}
        accounts={accounts}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSettledSuccess={handleSettledSuccess}
      />
    </>
  );
};
