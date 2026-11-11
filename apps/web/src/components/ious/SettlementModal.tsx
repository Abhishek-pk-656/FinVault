'use client';

import React, { useState } from 'react';
import { Card, Button, AmountInput, formatMinorToDecimal } from '@finvault/ui';
import { ArrowDownLeft, ArrowUpRight, X, CheckCircle2, AlertCircle } from 'lucide-react';
import type { SerializedIOURecord, SerializedAccount } from '../../lib/money/serialization';
import { settleIOUAction } from '../../lib/supabase/actions';

interface SettlementModalProps {
  iou: SerializedIOURecord | null;
  accounts: SerializedAccount[];
  isOpen: boolean;
  onClose: () => void;
  onSettledSuccess?: () => void;
}

export const SettlementModal: React.FC<SettlementModalProps> = ({
  iou,
  accounts,
  isOpen,
  onClose,
  onSettledSuccess,
}) => {
  const assetAccounts = accounts.filter((a) => a.type === 'ASSET');
  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => assetAccounts[0]?.id || '');
  const [amountMinor, setAmountMinor] = useState<bigint>(() =>
    iou ? BigInt(iou.remaining_balance_minor) : 0n
  );
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync amount when iou changes
  React.useEffect(() => {
    if (iou) {
      setAmountMinor(BigInt(iou.remaining_balance_minor));
      setErrorMessage(null);
    }
  }, [iou]);

  if (!isOpen || !iou) return null;

  const isLent = iou.direction === 'LENT';
  const remainingMinor = BigInt(iou.remaining_balance_minor);
  const isValidAmount = amountMinor > 0n && amountMinor <= remainingMinor;

  const handleConfirm = async () => {
    if (!isValidAmount || !selectedAccountId) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await settleIOUAction({
        iou_id: iou.id,
        settlement_amount_minor: amountMinor.toString(),
        account_id: selectedAccountId,
        notes: notes.trim() || undefined,
      });

      if (res.success) {
        onSettledSuccess?.();
        onClose();
      } else {
        setErrorMessage(res.error || 'Failed to settle debt.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred during settlement.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#040A0A]/80 backdrop-blur-sm transition-opacity duration-150 ease-out">
      <Card variant="surface" className="max-w-lg w-full p-6 relative shadow-2xl transition-all duration-150 ease-out">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-[#90A999] hover:text-[#38424C] p-1 rounded-xl transition-colors duration-150 ease-out"
          aria-label="Close Modal"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Title & Direction Indicator */}
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2.5 rounded-2xl ${isLent ? 'bg-[#7AAA4A]/20 text-[#7AAA4A]' : 'bg-[#E06A55]/20 text-[#E06A55]'}`}>
            {isLent ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
          </div>
          <div>
            <h3 className="text-lg font-bold text-[#38424C]">
              {isLent ? 'Record Peer Repayment' : 'Disburse Debt Settlement'}
            </h3>
            <p className="text-xs text-[#90A999]">
              Counterparty: <span className="font-semibold text-[#38424C]">{iou.counterparty_name}</span>
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl flex items-center gap-2 text-xs font-medium bg-[#E06A55]/20 text-[#E06A55] border border-[#E06A55]/30">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Contra Clearing Notice */}
        <div className="bg-[#040A0A]/5 border border-[#C7E0BA] rounded-2xl p-3.5 mb-5 text-xs text-[#38424C] space-y-1">
          <span className="font-semibold text-[#7AAA4A]">Double-Entry Contra Clearing</span>
          <p className="text-[11px] text-[#90A999]">
            {isLent
              ? `Debits chosen asset account and credits contra clearing account (clearing receivable of ₹${formatMinorToDecimal(amountMinor)}).`
              : `Disburses funds from chosen asset account and debits contra clearing account (clearing debt payable of ₹${formatMinorToDecimal(amountMinor)}).`}
          </p>
        </div>

        {/* Settlement Account Picker */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-xs font-semibold text-[#38424C] mb-1">
              {isLent ? 'Deposit Inflow Account' : 'Disbursement Source Account'}
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full rounded-xl border border-[#C7E0BA] bg-[#DEEEDA] px-3.5 py-2.5 text-sm text-[#38424C] focus:ring-2 focus:ring-[#7AAA4A] focus:outline-none transition-all duration-150 ease-out"
            >
              {assetAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} (Balance: ₹{formatMinorToDecimal(BigInt(acc.balance_minor))})
                </option>
              ))}
            </select>
          </div>

          {/* Settlement Amount Input */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-[#38424C]">Settlement Amount</label>
              <button
                type="button"
                onClick={() => setAmountMinor(remainingMinor)}
                className="text-[11px] text-[#7AAA4A] hover:underline font-semibold"
              >
                Full Balance (₹{formatMinorToDecimal(remainingMinor)})
              </button>
            </div>
            <AmountInput
              valueMinor={amountMinor}
              onChangeMinor={setAmountMinor}
              className="w-full text-base font-bold"
            />
            {amountMinor > remainingMinor && (
              <p className="text-xs text-[#E06A55] mt-1">Amount cannot exceed outstanding balance.</p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-[#38424C] mb-1">Memo / Settlement Notes</label>
            <input
              type="text"
              placeholder="e.g. Bank IMPS transfer / UPI payment"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-[#C7E0BA] bg-[#DEEEDA] px-3.5 py-2 text-sm text-[#38424C] focus:ring-2 focus:ring-[#7AAA4A] focus:outline-none transition-all duration-150 ease-out"
            />
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#C7E0BA]">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleConfirm}
            disabled={!isValidAmount || !selectedAccountId || isSubmitting}
            isLoading={isSubmitting}
            className="flex items-center gap-1.5"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>{isSubmitting ? 'Posting...' : 'Confirm Settlement'}</span>
          </Button>
        </div>
      </Card>
    </div>
  );
};
