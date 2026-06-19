import { useState } from "react";
import type { Deal, OutcomePatch, Stage } from "../types";
import { FEE, money } from "../lib";

export default function DealEditor({
  deal, onSave, onClose,
}: {
  deal: Deal;
  onSave: (patch: OutcomePatch) => void;
  onClose: () => void;
}) {
  const [buy, setBuy] = useState(String(deal.boughtPrice ?? deal.buy ?? ""));
  const [sold, setSold] = useState(String(deal.soldPrice ?? ""));
  const [stage, setStage] = useState<Stage>(deal.status ?? "new");
  const [notes, setNotes] = useState(deal.notes ?? "");

  const net = Math.round(((Number(sold) || deal.resale || 0) * (1 - FEE)) - (Number(buy) || 0));

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>{deal.title.slice(0, 48)}</h2>
        <div className="fld"><label>Buy / cost basis ($)</label>
          <input type="number" step="1" value={buy} onChange={(e) => setBuy(e.target.value)} /></div>
        <div className="fld"><label>Expected resale ($)</label>
          <input type="number" value={deal.resale} disabled /></div>
        <div className="fld"><label>Actual sold price ($) — set when sold</label>
          <input type="number" step="1" placeholder="—" value={sold} onChange={(e) => setSold(e.target.value)} /></div>
        <div className="fld"><label>Stage</label>
          <select value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
            <option value="new">Triage (scouting)</option>
            <option value="bought">Buying (fighting)</option>
            <option value="sold">Sold (looted)</option>
            <option value="skipped">Passed / Loss (fled)</option>
          </select></div>
        <div className="fld"><label>Net (live)</label>
          <div className="net" style={{ color: net >= 0 ? "var(--green)" : "var(--red)" }}>{money(net)}</div></div>
        <div className="fld"><label>Notes</label>
          <input type="text" placeholder="optional" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <div className="mrow">
          <button className="cancel" onClick={onClose}>Cancel</button>
          <button className="save" onClick={() => onSave({
            status: stage,
            boughtPrice: Number(buy) || 0,
            soldPrice: sold ? Number(sold) : undefined,
            notes,
          })}>Save</button>
        </div>
      </div>
    </div>
  );
}
