'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Card, Button, BalanceBadge, AmountInput, formatMinorToDecimal } from '@finvault/ui';
import { Plus, Trash2, Wand2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { SerializedAccount } from '../../lib/money/serialization';
import { submitTransactionAction } from '../../lib/supabase/actions';

interface SplitLeg {
  id: string; // client temporary ID
  account_id: string;
  direction: 'DEBIT' | 'CREDIT';
  amount_minor: bigint;
}

interface MultiSplitFormProps {
  accounts: SerializedAccount[];
}

export const MultiSplitForm: React.FC<MultiSplitFormProps> = ({ accounts }) => {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Initial balanced 2-leg split template
  const [legs, setLegs] = useState<SplitLeg[]>([
    { id: '1', account_id: accounts.find((a) => a.type === 'EXPENSE')?.id || accounts[0]?.id || '', direction: 'DEBIT', amount_minor: 0n },
    { id: '2', account_id: accounts.find((a) => a.type === 'ASSET')?.id || accounts[1]?.id || '', direction: 'CREDIT', amount_minor: 0n },
  ]);

  // Real-time sub-50ms balance calculation on every keystroke
  const { totalDebits, totalCredits, difference } = useMemo(() => {
    let debits = 0n;
    let credits = 0n;
    for (const leg of legs) {
      if (leg.direction === 'DEBIT') debits += leg.amount_minor;
      else credits += leg.amount_minor;
    }
    return {
      totalDebits: debits,
      totalCredits: credits,
      difference: debits - credits,
    };
  }, [legs]);

  const isBalanced = difference === 0n && totalDebits > 0n;
  const canSubmit = isBalanced && description.trim().length > 0 && !isSubmitting;

  const handleUpdateLeg = useCallback((id: string, updates: Partial<SplitLeg>) => {
    setLegs((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
  }, []);

  const handleAddLeg = () => {
    setLegs((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        account_id: accounts[0]?.id || '',
        direction: difference > 0n ? 'CREDIT' : 'DEBIT',
        amount_minor: difference !== 0n ? (difference > 0n ? difference : -difference) : 0n,
      },
    ]);
  };

  const handleRemoveLeg = (id: string) => {
    if (legs.length <= 2) return;
    setLegs((prev) => prev.filter((l) => l.id !== id));
  };

  const handleAutoBalance = () => {
    if (difference === 0n) return;
    if (difference > 0n) {
      // Debits exceed credits: append offsetting credit leg
      setLegs((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).substring(2, 9),
          account_id: accounts.find((a) => a.type === 'ASSET')?.id || accounts[0]?.id || '',
          direction: 'CREDIT',
          amount_minor: difference,
        },
      ]);
    } else {
      // Credits exceed debits: append offsetting debit leg
      setLegs((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).substring(2, 9),
          account_id: accounts.find((a) => a.type === 'EXPENSE')?.id || accounts[0]?.id || '',
          direction: 'DEBIT',
          amount_minor: -difference,
        },
      ]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    setSubmitMessage(null);

    try {
      const res = await submitTransactionAction({
        transaction_date: date,
        description: description.trim(),
        notes: notes.trim() || undefined,
        entries: legs.map((l) => ({
          account_id: l.account_id,
          direction: l.direction,
          amount_minor: l.amount_minor.toString(),
        })),
      });

      if (res.success) {
        setSubmitMessage({ type: 'success', text: `Transaction posted successfully! ID: ${res.transactionId}` });
        setDescription('');
        setNotes('');
        setLegs([
          { id: '1', account_id: accounts.find((a) => a.type === 'EXPENSE')?.id || accounts[0]?.id || '', direction: 'DEBIT', amount_minor: 0n },
          { id: '2', account_id: accounts.find((a) => a.type === 'ASSET')?.id || accounts[1]?.id || '', direction: 'CREDIT', amount_minor: 0n },
        ]);
      } else {
        setSubmitMessage({ type: 'error', text: res.error || 'Failed to post transaction.' });
      }
    } catch (err: any) {
      setSubmitMessage({ type: 'error', text: err.message || 'An unexpected error occurred.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Group 1: Transaction Header Metadata & Live Balance Badge */}
      <Card variant="surface" className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#C7E0BA] gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#38424C]">New Multi-Split Transaction</h2>
            <p className="text-xs text-[#90A999]">Strict Double-Entry Lite Invariant</p>
          </div>
          <div className="flex items-center gap-2">
            <BalanceBadge differenceMinor={difference} />
            {difference !== 0n && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleAutoBalance}
                className="text-xs flex items-center gap-1.5 text-[#7AAA4A]"
              >
                <Wand2 className="h-3.5 w-3.5" />
                <span>Auto-Balance</span>
              </Button>
            )}
          </div>
        </div>

        {submitMessage && (
          <div
            className={`mt-4 p-3 rounded-xl flex items-center gap-2 text-xs font-medium ${
              submitMessage.type === 'success'
                ? 'bg-[#7AAA4A]/20 text-[#7AAA4A] border border-[#7AAA4A]/30'
                : 'bg-[#E06A55]/20 text-[#E06A55] border border-[#E06A55]/30'
            }`}
          >
            {submitMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{submitMessage.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <div>
            <label className="block text-xs font-semibold text-[#38424C] mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-[#C7E0BA] bg-[#DEEEDA] px-3.5 py-2 text-sm text-[#38424C] focus:ring-2 focus:ring-[#7AAA4A] focus:outline-none transition-all duration-150 ease-out"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-[#38424C] mb-1">Description</label>
            <input
              type="text"
              placeholder="e.g. Dinner & Grocery Split with Bob"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-[#C7E0BA] bg-[#DEEEDA] px-3.5 py-2 text-sm text-[#38424C] focus:ring-2 focus:ring-[#7AAA4A] focus:outline-none transition-all duration-150 ease-out"
            />
          </div>
        </div>
      </Card>

      {/* Group 2: Dynamic Multi-Split Journal Entries Form Table */}
      <Card variant="surface" className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#38424C]">Split Legs</h3>
          <div className="text-xs text-[#90A999]">
            Debits: ₹{formatMinorToDecimal(totalDebits)} · Credits: ₹{formatMinorToDecimal(totalCredits)}
          </div>
        </div>

        <div className="space-y-3">
          {legs.map((leg, index) => (
            <div
              key={leg.id}
              className="flex flex-wrap sm:flex-nowrap items-center gap-3 bg-[#040A0A]/5 p-3 rounded-2xl border border-[#C7E0BA]"
            >
              <span className="text-xs font-mono text-[#90A999] w-6 shrink-0">#{index + 1}</span>

              {/* Account Dropdown */}
              <select
                value={leg.account_id}
                onChange={(e) => handleUpdateLeg(leg.id, { account_id: e.target.value })}
                className="flex-1 min-w-[180px] rounded-xl border border-[#C7E0BA] bg-[#DEEEDA] px-3 py-2 text-xs text-[#38424C] focus:outline-none focus:ring-2 focus:ring-[#7AAA4A] transition-all duration-150 ease-out"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.type} · {acc.currency})
                  </option>
                ))}
              </select>

              {/* Direction Toggle */}
              <div className="flex rounded-xl overflow-hidden border border-[#C7E0BA] shrink-0">
                <button
                  type="button"
                  onClick={() => handleUpdateLeg(leg.id, { direction: 'DEBIT' })}
                  className={`px-3 py-2 text-xs font-semibold transition-colors duration-150 ease-out ${
                    leg.direction === 'DEBIT' ? 'bg-[#7AAA4A] text-white' : 'bg-[#DEEEDA] text-[#38424C]'
                  }`}
                >
                  DEBIT
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateLeg(leg.id, { direction: 'CREDIT' })}
                  className={`px-3 py-2 text-xs font-semibold transition-colors duration-150 ease-out ${
                    leg.direction === 'CREDIT' ? 'bg-[#38424C] text-white' : 'bg-[#DEEEDA] text-[#38424C]'
                  }`}
                >
                  CREDIT
                </button>
              </div>

              {/* AmountInput (strict minor units) */}
              <div className="w-36 shrink-0">
                <AmountInput
                  valueMinor={leg.amount_minor}
                  onChangeMinor={(val) => handleUpdateLeg(leg.id, { amount_minor: val })}
                  className="w-full text-right py-1.5 px-3 text-sm"
                />
              </div>

              {/* Remove Leg Button */}
              <button
                type="button"
                disabled={legs.length <= 2}
                onClick={() => handleRemoveLeg(leg.id)}
                className="p-2 text-[#90A999] hover:text-[#E06A55] disabled:opacity-30 disabled:pointer-events-none transition-colors duration-150 ease-out shrink-0"
                aria-label="Remove Leg"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-6 pt-4 border-t border-[#C7E0BA]">
          <Button variant="secondary" size="sm" onClick={handleAddLeg} className="text-xs flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            <span>Add Leg</span>
          </Button>

          <Button
            variant="primary"
            disabled={!canSubmit}
            onClick={handleSubmit}
            isLoading={isSubmitting}
            className="flex items-center gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>{isSubmitting ? 'Posting...' : 'Post Transaction'}</span>
          </Button>
        </div>
      </Card>
    </>
  );
};
