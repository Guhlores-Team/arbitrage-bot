import type { Quest } from "../progression";

export default function Quests({ quests, onClaim }: { quests: Quest[]; onClaim: (id: string, reward: number) => void }) {
  return (
    <>
      <div style={{ marginBottom: 14, font: "13px 'Hanken Grotesk'", color: "var(--muted2)" }}>
        Daily quests — progress is live from today's flips. Claim for XP.
      </div>
      <div className="qgrid">
        {quests.map((q) => {
          const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
          return (
            <div className="beast" key={q.id} style={{ borderColor: q.claimable ? "var(--gold)" : "var(--line2)" }}>
              <div className="bt" style={{ fontSize: 17, float: "none" }}>{q.label}</div>
              <div className="bs">Reward · +{q.reward} XP</div>
              <div className="bounty" style={{ marginTop: 14 }}><div className="bountyfill" style={{ width: pct + "%" }} /></div>
              <div className="brow"><span>Progress <b>{q.progress} / {q.target}</b></span><span style={{ marginLeft: "auto" }}>{pct}%</span></div>
              <div className="bacts">
                {q.claimed ? (
                  <button className="bbtn ghost" style={{ flex: 1, color: "var(--green)" }} disabled>✓ Claimed</button>
                ) : (
                  <button className="bbtn loot" style={{ opacity: q.claimable ? 1 : 0.4, cursor: q.claimable ? "pointer" : "not-allowed" }}
                    disabled={!q.claimable} onClick={() => onClaim(q.id, q.reward)}>
                    {q.claimable ? "✨ CLAIM" : "In progress"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
